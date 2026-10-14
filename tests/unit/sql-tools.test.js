import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,devEndpoint,database,role,responses,devBranch,mainBranch}
 from '../../test/helpers/neon-fixtures.js';
import {verifyConnectionTarget} from '../../src/tools/connections.js';
import {tools,createSqlQueryHandlers} from '../../src/tools/sql.js';

const args={projectId:IDS.project,branchId:IDS.dev,endpointId:IDS.devEndpoint,
 databaseName:'neondb',roleName:'neondb_owner',query:'SELECT $1::int AS answer',params:[7]};
const body=response=>JSON.parse(response.content[0].text);
function setup({policy={productionReads:true,maxRows:20},protectedItem=false,
 fakeEndpoint=null,production=false}={}){
 const fake=makeFakeNeon(),queries=[],opens=[];
 const client=makeNeonClient({key:'napi_FAKE_sql_d5',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true};}}});
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
 fake.when('getProjectEndpoint').resolves({endpoint:fakeEndpoint??devEndpoint()});
 fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev)});
 fake.when('getProjectBranchRole').resolves({role:role(IDS.dev)});
 const db={getSqlReadPolicy:async()=>policy,
  getProtectedResources:async()=>protectedItem?[{kind:'other',org:IDS.org,
   project_id:IDS.project,label:'blocked'}]:[]};
 const connection={neonOrg:IDS.org,projectScope:IDS.project,
  profile:'full',mode:'preview'};
 const ctx={connection,db,env:{DATABASE_URL:'postgresql://self@self.fake.invalid/service'}};
 const trusted={connection,db,selfProject:{org:IDS.org,project_id:'proj-fake-own'},
  getBranch:async()=>production?mainBranch():devBranch()};
 const withSql=async(_scope,target,callback)=>{
  opens.push(target);
  return callback({query:async(sql,params=[])=>{
   queries.push({sql,params});
   if(sql.startsWith('SELECT'))return {rows:[{answer:7}],rowCount:1};
   return {rows:[]};
  }});
 };
 const handlers=createSqlQueryHandlers({
  verifyTarget:(a,c)=>verifyConnectionTarget(a,c,async()=>({client})),
  contextFor:async()=>trusted,layerFactory:()=>withSql
 });
 return {fake,queries,opens,handlers,ctx};
}
describe('D-5 owner-approved SQL query',()=>{
 it('registers a read-only SQL tool without role-deletion authority',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_sql_query',writes:false,area:'sql'});
  expect(tools[0].profiles).toContain('read_only');
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
  expect(tools[0].inputSchema.required).toContain('query');
 });
 it('verifies five provider identities and runs one bounded direct read-only transaction',async()=>{
  const f=setup();
  const out=body(await f.handlers.neon_sql_query(args,f.ctx));
  expect(out).toMatchObject({done:true,production:false,rows:[{answer:7}],rowCount:1,maxRows:20});
  expect(f.fake.calls.map(x=>x.operationId).sort()).toEqual([
   'getProject','getProjectBranch','getProjectBranchDatabase',
   'getProjectBranchRole','getProjectEndpoint'].sort());
  expect(f.fake.calls.every(x=>x.method==='GET'&&x.auth)).toBe(true);
  expect(f.opens).toEqual([{projectId:IDS.project,branchId:IDS.dev,
   endpointId:IDS.devEndpoint,expectedEndpointHost:devEndpoint().host,
   database:'neondb',role:'neondb_owner',pooled:false}]);
  expect(f.queries.map(x=>x.sql)).toEqual(['BEGIN READ ONLY',
   'SET LOCAL statement_timeout = 15000','SET LOCAL lock_timeout = 5000',
   args.query,'COMMIT']);
  expect(f.queries[3].params).toEqual([7]);
  f.fake.assertClean();
 });
 it('refuses write SQL and unsafe plans before opening a connection',async()=>{
  for(const query of ['DELETE FROM invoices','SELECT 1; DELETE FROM invoices',
   'WITH changed AS (DELETE FROM invoices RETURNING *) SELECT * FROM changed',
   'EXPLAIN ANALYZE DELETE FROM invoices','SELECT pg_terminate_backend(1)']){
   const f=setup();
   expect(body(await f.handlers.neon_sql_query({...args,query},f.ctx)).done).toBe(false);
   expect(f.opens).toHaveLength(0);
   f.fake.assertClean();
  }
 });
 it('blocks foreign scope and forged endpoint assignment',async()=>{
  const foreign=setup();
  await expect(foreign.handlers.neon_sql_query({...args,projectId:'proj-foreign'},foreign.ctx))
   .rejects.toThrow();
  expect(foreign.fake.calls).toHaveLength(0);
  const forged=setup({fakeEndpoint:devEndpoint({branch_id:IDS.main})});
  await expect(forged.handlers.neon_sql_query(args,forged.ctx)).rejects.toThrow();
  expect(forged.opens).toHaveLength(0);
  forged.fake.assertClean();
 });
 it('enforces owner-protected resources and the production read switch',async()=>{
  const blocked=setup({protectedItem:true});
  expect(body(await blocked.handlers.neon_sql_query(args,blocked.ctx)).code)
   .toBe('protected_resource');
  expect(blocked.opens).toHaveLength(0);
  const prod=setup({production:true,policy:{productionReads:false,maxRows:20}});
  expect(body(await prod.handlers.neon_sql_query(args,prod.ctx)).code)
   .toBe('production_reads_disabled');
  expect(prod.opens).toHaveLength(0);
 });
});
