import {describe,it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {IDS,project,mainBranch,devBranch,mainEndpoint,devEndpoint} from '../../test/helpers/neon-fixtures.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {createSecurityReadHandlers,RLS_COVERAGE_SQL,summarizeRlsCoverage} from '../../src/tools/security.js';

const args={projectId:IDS.project,rlsTarget:{branchId:IDS.dev,endpointId:IDS.devEndpoint,
 databaseName:'neondb',roleName:'neondb_owner'}};
function fixture({sql={done:true,rowCount:1,truncated:false,rows:[{
 schema_name:'public',table_count:4,rls_enabled:2,rls_forced:1,tables_with_policies:2}]},
 verified=true}={}){
 const fake=makeFakeNeon(),sqlCalls=[],verifyCalls=[];
 const client=makeNeonClient({key:'napi_FAKE_rls_read',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:project()});
 fake.when('listProjectBranches').resolves({branches:[mainBranch(),devBranch()],annotations:{}});
 fake.when('listProjectEndpoints').resolves({endpoints:[mainEndpoint(),devEndpoint()]});
 fake.when('getProjectJWKS').resolves({jwks:[]});
 const c={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'}};
 const handler=createSecurityReadHandlers({
  getClient:async()=>({client}),
  verifyTarget:async a=>{verifyCalls.push(a);if(!verified)throw Error('foreign');
   return {pid:IDS.project,bid:IDS.dev,endpointId:IDS.devEndpoint,
    database:'neondb',role:'neondb_owner',endpoint:{host:devEndpoint().host}};},
  contextFor:async()=>({trusted:true}),
  runQuery:async a=>{sqlCalls.push(a);return sql}
 }).neon_security_review;
 return {fake,c,handler,sqlCalls,verifyCalls};
}
const json=response=>JSON.parse(response.content[0].text);
describe('D-8 optional verified RLS posture',()=>{
 it('keeps its fixed catalog SQL classified read-only and avoids sensitive table data',async()=>{
  expect((await classifySql(RLS_COVERAGE_SQL)).kind).toBe('read');
  expect(RLS_COVERAGE_SQL).toContain('pg_catalog.pg_policy');
  expect(RLS_COVERAGE_SQL).toContain('c.relrowsecurity');
  expect(RLS_COVERAGE_SQL).toContain('LIMIT 201');
  expect(RLS_COVERAGE_SQL).not.toContain('pg_terminate_backend');
 });
 it('makes no database connection unless the owner explicitly supplies a target',async()=>{
  const f=fixture(),out=json(await f.handler({projectId:IDS.project},f.c));
  expect(out.notEvaluated).toContain('RLS policy coverage');
  expect(out.checks.rlsCoverage).toBeUndefined();
  expect(f.sqlCalls).toHaveLength(0);
  expect(f.verifyCalls).toHaveLength(0);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('binds an exact verified direct target and returns per-schema aggregates without SQL text',async()=>{
  const f=fixture(),out=json(await f.handler(args,f.c));
  expect(f.verifyCalls).toEqual([{...args.rlsTarget,projectId:IDS.project}]);
  expect(f.sqlCalls).toHaveLength(1);
  expect(f.sqlCalls[0]).toMatchObject({target:{
   projectId:IDS.project,branchId:IDS.dev,endpointId:IDS.devEndpoint,
   expectedEndpointHost:devEndpoint().host,database:'neondb',role:'neondb_owner',pooled:false},
   text:RLS_COVERAGE_SQL,params:[]});
  expect(out.checks.rlsCoverage).toMatchObject({state:'observed',schemaCount:1,
   tables:4,rlsEnabled:2,rlsForced:1,tablesWithPolicies:2,
   effectiveness:'notEvaluated'});
  expect(out.notEvaluated).not.toContain('RLS policy coverage');
  expect(out.metadataComplete).toBe(true);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('fails closed for unknown identity, SQL denial, truncation and malformed inventory',async()=>{
  for(const setup of [
   {verified:false},{sql:{done:false,code:'production_reads_disabled'}},
   {sql:{done:true,rowCount:2,truncated:true,rows:[]}},
   {sql:{done:true,rowCount:1,rows:[{schema_name:'public',table_count:1,
     rls_enabled:2,rls_forced:0,tables_with_policies:0}]}}
  ]){
   const f=fixture(setup),out=json(await f.handler(args,f.c));
   expect(['unavailable','incomplete']).toContain(out.checks.rlsCoverage.state);
   expect(out.notEvaluated).toContain('RLS policy coverage');
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('rejects partial target schema and foreign project before SQL',async()=>{
  const f=fixture();
  await expect(f.handler({projectId:IDS.project,
   rlsTarget:{branchId:IDS.dev}},f.c)).rejects.toThrow(/exact database/);
  expect(f.sqlCalls).toHaveLength(0);
  await expect(f.handler({...args,projectId:'proj-fake-foreign'},f.c))
   .rejects.toThrow(/scope/);
  expect(f.sqlCalls).toHaveLength(0);
 });
 it('refuses duplicate catalog schemas and never calls a truncated view complete',()=>{
  const row={schema_name:'public',table_count:3,rls_enabled:1,
   rls_forced:0,tables_with_policies:1};
  expect(summarizeRlsCoverage({done:true,rowCount:2,rows:[row,row]}).state)
   .toBe('incomplete');
  expect(summarizeRlsCoverage({done:true,rowCount:0,rows:[],truncated:true}).state)
   .toBe('incomplete');
 });
});
