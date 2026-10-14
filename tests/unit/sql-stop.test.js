import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,devEndpoint,database,role,responses}
 from '../../test/helpers/neon-fixtures.js';
import {createSqlStopHandlers} from '../../src/tools/sql-stop.js';
import {verifyConnectionTarget} from '../../src/tools/connections.js';
import {requestScopedQueryCancellation,observeScopedQueryCancellation}
 from '../../src/neon/sql-run.js';

const a={projectId:IDS.project,branchId:IDS.dev,endpointId:IDS.devEndpoint,
 databaseName:'neondb',roleName:'neondb_owner',pid:12345};
const unpack=r=>JSON.parse(r.content[0].text);
function fixture({allowed=true,foreignEndpoint=false,verified=true}={}){
 const fake=makeFakeNeon(),changes=[],requests=[];
 const client=makeNeonClient({key:'napi_FAKE_sql_cancel',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
 fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint(
  foreignEndpoint?{branch_id:IDS.main}:{})});
 fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev)});
 fake.when('getProjectBranchRole').resolves({role:role(IDS.dev)});
 const context={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:'preview',profile:'full'},env:{VERCEL_ENV:'production'},db:{
  recordWritePreview:async x=>changes.push(x),
  reserveWrite:async x=>{changes.push(x);return {created:true,id:changes.length}},
  completeWrite:async x=>changes.push(x)},
  deploymentEnv:'production',
  clientFor:async()=>client,writeKey:()=> 'rmcp_sql_stop_123456789',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),
   checkSpend:async()=>allowed}};
 const handler=createSqlStopHandlers({
  contextFor:async()=>context,
  verifyTarget:(x,c)=>verifyConnectionTarget(x,c,async()=>({client})),
  requestStop:async args=>{
   requests.push({phase:'signal',args});
   return {requested:true,signature:{pid:a.pid,backendStart:'1791930000.000000',
    queryStart:'1791930060.000000'}};},
  readStop:async args=>{
   requests.push({phase:'readback',args});
   return {finished:verified};
  }});
 return {context,fake,changes,requests,handler};
}
describe('D-5 single query interruption owner write contract',()=>{
 it('requires full owner, B-1 audited confirmation, and never terminates sessions',()=>{
  const f=fixture(),t=f.handler.tools[0];
  expect(t).toMatchObject({name:'neon_sql_stop_query',writes:true,
   destructive:true,access:true,profiles:['full'],
   writeContract:'defineWrite-v1'});
  expect(t.inputSchema.additionalProperties).toBe(false);
  expect(t.inputSchema.required).toContain('pid');
 });
 it('shows preview before signal and verifies the exact activity on a separate readback',async()=>{
  const f=fixture(),run=f.handler.handlers.neon_sql_stop_query;
  const preview=unpack(await run({...a,dryRun:true},{}));
  expect(preview.needsConfirmation).toBe(true);
  expect(f.requests).toHaveLength(0);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  const denied=unpack(await run(a,{}));
  expect(denied.code).toBe('needs_confirmation');
  expect(f.requests).toHaveLength(0);
  const applied=unpack(await run({...a,confirm:true},{}));
  expect(applied).toMatchObject({done:true,confirmed:true});
  expect(f.requests.map(q=>q.phase)).toEqual(['signal','readback']);
  expect(f.requests[0].args.target).toMatchObject({
   projectId:IDS.project,branchId:IDS.dev,database:'neondb',
   role:'neondb_owner',endpointId:IDS.devEndpoint,pooled:false});
  expect(f.requests[1].args.signature.pid).toBe(a.pid);
  expect(f.changes.some(x=>x.confirmed==='true')).toBe(true);
  expect(JSON.stringify(applied)).not.toMatch(/password|connectionString|queryStart/);
  f.fake.assertClean();
 });
 it('refuses unsafe scope, forged endpoint, protected policy, and invalid PID',async()=>{
  for(const settings of [{foreignEndpoint:true},{allowed:false}]){
   const f=fixture(settings);
   const out=unpack(await f.handler.handlers.neon_sql_stop_query(
    {...a,confirm:true},{}));
   expect(out.done).toBe(false);
   expect(f.requests).toHaveLength(0);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
  const f=fixture();
  for(const pid of [0,-1,2147483648,1.5]){
   const res=unpack(await f.handler.handlers.neon_sql_stop_query(
    {...a,pid,confirm:true},{}));
   expect(res.done).toBe(false);
  }
  expect(f.requests).toHaveLength(0);
 });
 it('never certifies a signal that lacks independent state evidence',async()=>{
  const f=fixture({verified:false});
  const result=unpack(await f.handler.handlers.neon_sql_stop_query(
   {...a,confirm:true},{}));
  expect(result.done).toBe(false);
  expect(result.confirmed).not.toBe(true);
  expect(f.requests.map(x=>x.phase)).toEqual(['signal','readback']);
  f.fake.assertClean();
 });
});
describe('D-5 fixed server-side PostgreSQL cancellation boundary',()=>{
 const target={projectId:IDS.project,branchId:IDS.dev,database:'neondb',
  role:'neondb_owner',endpointId:IDS.devEndpoint,
  expectedEndpointHost:devEndpoint().host,pooled:false};
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project}};
 const activity={pid:12345,datname:'neondb',usename:'neondb_owner',
  backend_type:'client backend',state:'active',
  backend_start:'1791930000.000000',query_start:'1791930060.000000'};
 function layer({missing=false,stale=false}={}){
  const statements=[];
  const sqlLayer=async(_scope,_target,cb)=>cb({query:async(sql,params)=>{
   statements.push({sql,params});
   if(sql.includes('pg_cancel_backend'))return {rows:stale?[]:[{cancelled:true}]};
   return {rows:missing?[]:[activity]};
  }});
  return {statements,sqlLayer};
 }
 it('cancels only an owned active query on the selected DB with bound immutable signature',async()=>{
  const f=layer();
  const result=await requestScopedQueryCancellation({
   ctx,target,pid:12345,sqlLayer:f.sqlLayer});
  expect(result).toMatchObject({requested:true,signature:{pid:12345}});
  expect(f.statements).toHaveLength(2);
  expect(f.statements[0].sql).toContain('datname=current_database()');
  expect(f.statements[0].sql).toContain('usename=current_user');
  expect(f.statements[1].sql).toContain('EXTRACT(EPOCH FROM backend_start)::text=$2');
  expect(f.statements[1].sql).toContain('EXTRACT(EPOCH FROM query_start)::text=$3');
  expect(f.statements[1].params).toEqual(
   [12345,activity.backend_start,activity.query_start]);
  expect(f.statements.every(q=>!q.sql.includes('pg_terminate_backend'))).toBe(true);
 });
 it('does not signal an absent, mismatched or inactive PID',async()=>{
  for(const options of [{missing:true},{stale:true}]){
   const f=layer(options);
   const result=await requestScopedQueryCancellation({
    ctx,target,pid:12345,sqlLayer:f.sqlLayer});
   expect(result.requested).toBe(false);
   expect(f.statements.length).toBe(options.missing?1:2);
  }
 });
 it('requires a separate positive observation before reporting the old query finished',async()=>{
  const f=layer({missing:true});
  const result=await observeScopedQueryCancellation({
   ctx,target,pid:12345,
   signature:{pid:12345,backendStart:activity.backend_start,
    queryStart:activity.query_start},sqlLayer:f.sqlLayer});
  expect(result.finished).toBe(true);
  expect(f.statements).toHaveLength(1);
  const active=layer();
  const remaining=await observeScopedQueryCancellation({
   ctx,target,pid:12345,
   signature:{pid:12345,backendStart:activity.backend_start,
    queryStart:activity.query_start},sqlLayer:active.sqlLayer});
  expect(remaining.finished).toBe(false);
 });
});
