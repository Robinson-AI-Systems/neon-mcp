import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,devEndpoint,database,role,responses,devBranch}
 from '../../test/helpers/neon-fixtures.js';
import {verifyConnectionTarget} from '../../src/tools/connections.js';
import {runPublicSqlQuery,runPublicSqlExplain} from '../../src/neon/sql-run.js';
import {tools,createSqlQueryHandlers} from '../../src/tools/sql.js';

const args={projectId:IDS.project,branchId:IDS.dev,endpointId:IDS.devEndpoint,
 databaseName:'neondb',roleName:'neondb_owner',query:'SELECT $1::int AS answer',params:[7]};
const body=response=>JSON.parse(response.content[0].text);
function setup({policy={productionReads:true,maxRows:20},protectedItem=false,
 fakeEndpoint=null,production=false,huge=false}={}){
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
  getBranch:async()=>production?devBranch({default:true,protected:true}):devBranch()};
 const withSql=async(_scope,target,callback)=>{
  opens.push(target);
  return callback({query:async(sql,params=[])=>{
   queries.push({sql,params});
   if(sql.startsWith('EXPLAIN'))return {rows:[{'QUERY PLAN':'Seq Scan on fake_table'}],rowCount:1};
   if(sql.startsWith('SELECT')){
    const rows=huge?Array.from({length:300},(_,i)=>({answer:'x'.repeat(600),id:i})):[{answer:7}];
    return {rows:rows.slice(0,params.at(-1)),rowCount:rows.length};
   }
   return {rows:[]};
  }});
 };
 const handlers=createSqlQueryHandlers({
  verifyTarget:(a,c)=>verifyConnectionTarget(a,c,async()=>({client})),
  contextFor:async()=>trusted,
  runQuery:options=>runPublicSqlQuery({...options,sqlLayer:withSql}),
  runExplain:options=>runPublicSqlExplain({...options,sqlLayer:withSql})
 });
 return {fake,queries,opens,handlers,ctx};
}
describe('D-5 owner-approved SQL query',()=>{
 it('registers a read-only SQL tool without role-deletion authority',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_sql_query','neon_sql_explain','neon_sql_list_activity','neon_sql_list_slow_queries']);
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
   'SELECT * FROM ('+args.query+') AS rmcp_bounded_query LIMIT $2','COMMIT']);
  expect(f.queries[3].params).toEqual([7,201]);
  f.fake.assertClean();
 });
 it('bounds rows at the database and compacts oversized cells before results are stored',async()=>{
  const f=setup({huge:true,policy:{productionReads:true,maxRows:200}});
  const result=body(await f.handlers.neon_sql_query(args,f.ctx));
  expect(result).toMatchObject({done:true,rowCount:200,truncated:true,cellsCapped:true});
  expect(result.rows).toHaveLength(200);
  expect(result.rows[0].answer.length).toBeLessThanOrEqual(129);
  expect(f.queries[3].params.at(-1)).toBe(201);
  f.fake.assertClean();
 });
 it('explains a SELECT without running it by default, and ANALYZE only when explicit',async()=>{
  const f=setup();
  const planned=body(await f.handlers.neon_sql_explain(args,f.ctx));
  expect(planned).toMatchObject({done:true,analyzed:false});
  expect(f.queries.some(x=>x.sql.startsWith('EXPLAIN (FORMAT TEXT, ANALYZE FALSE) SELECT'))).toBe(true);
  const analyzed=body(await f.handlers.neon_sql_explain({...args,analyze:true},f.ctx));
  expect(analyzed).toMatchObject({done:true,analyzed:true});
  expect(f.queries.some(x=>x.sql.startsWith('EXPLAIN (FORMAT TEXT, ANALYZE TRUE) SELECT'))).toBe(true);
  const previous=f.opens.length;
  for(const query of ['DELETE FROM invoices','EXPLAIN ANALYZE DELETE FROM invoices',
   'WITH t AS (DELETE FROM invoices RETURNING *) SELECT * FROM t']){
   expect(body(await f.handlers.neon_sql_explain({...args,query,analyze:true},f.ctx)).done)
    .toBe(false);
  }
  expect(f.opens).toHaveLength(previous);
  f.fake.assertClean();
 });
 it('offers fixed same-database activity metadata without exposing query text',async()=>{
  const f=setup();
  const result=body(await f.handlers.neon_sql_list_activity(args,f.ctx));
  expect(result.done).toBe(true);
  expect(f.queries[3].sql).toContain('pg_catalog.pg_stat_activity');
  expect(f.queries[3].sql).toContain('current_database()');
  expect(f.queries[3].sql).not.toContain('pg_terminate_backend');
  expect(JSON.stringify(result)).not.toContain('SELECT $1::int AS answer');
  f.fake.assertClean();
 });
 it('shows scoped slow statement fingerprints without raw query text',async()=>{
  const f=setup();
  const result=body(await f.handlers.neon_sql_list_slow_queries(args,f.ctx));
  expect(result.done).toBe(true);
  expect(f.queries[3].sql).toContain('FROM pg_stat_statements');
  expect(f.queries[3].sql).toContain('datname=current_database()');
  expect(f.queries[3].sql).toContain('ORDER BY total_exec_time DESC');
  expect(f.queries[3].sql).not.toContain('SELECT query,');
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('honors the production read setting for slow-query inspection',async()=>{
  const f=setup({production:true,policy:{productionReads:false,maxRows:20}});
  expect(body(await f.handlers.neon_sql_list_slow_queries(args,f.ctx)).code)
   .toBe('production_reads_disabled');
  expect(f.opens).toHaveLength(0);
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
