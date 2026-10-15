import {describe,it,expect} from 'vitest';
import {evaluateIntegration,INTEGRATION_TABLES_SQL,
 INTEGRATION_EXTENSIONS_SQL} from '../../src/dev/integration-check.js';
import {classifySql} from '../../src/neon/sql-guard.js';
const spec={
 expectedTables:['public.widgets','public.customers'],latestMigration:'20261014_ready',
 expectedExtensions:['pgcrypto'],expectedRoles:['app_reader'],
 pooledHost:'ep-fake-pooler.us-east-2.aws.neon.tech',
 requireAuth:true,requireDataApi:true
};
const facts={
 tables:[{schema_name:'public',table_name:'widgets'},
  {schema_name:'public',table_name:'customers'}],
 latestMigration:'20261014_ready',
 extensions:[{extension_name:'pgcrypto'}],
 roles:[{name:'app_reader'}],
 defaultBranchProtected:true,devExpires:true,authEnabled:true,
 dataApiEnabled:true,quota:{verified:true,branchRemaining:4,computeRemaining:3}
};
describe('V-4 complete integration readiness matrix',()=>{
 it('uses metadata-only SQL and reports every verified item with no mutation',async()=>{
  expect((await classifySql(INTEGRATION_TABLES_SQL)).kind).toBe('read');
  expect((await classifySql(INTEGRATION_EXTENSIONS_SQL)).kind).toBe('read');
  const report=evaluateIntegration(spec,facts);
  expect(report.ready).toBe(true);
  expect(report.passed).toBe(report.total);
  expect(report.total).toBe(11);
  expect(report.checks.every(c=>c.status==='ok')).toBe(true);
 });
 it('reports each individually missing fact and tells the owner an actionable next step',()=>{
  const edits=[
   [{tables:[]},'table:public.widgets'],
   [{latestMigration:'older'},'migration'],
   [{extensions:[]},'extension:pgcrypto'],
   [{roles:[]},'role:app_reader'],
   [{defaultBranchProtected:false},'default_protection'],
   [{devExpires:false},'dev_expiry'],
   [{authEnabled:false},'neon_auth'],
   [{dataApiEnabled:false},'data_api'],
   [{quota:{verified:false}},'quota']
  ];
  for(const [changed,key] of edits){
   const report=evaluateIntegration(spec,{...facts,...changed});
   const entry=report.checks.find(x=>x.key===key);
   expect(entry,JSON.stringify(changed)).toMatchObject({
    status:'missing'});
   expect(typeof entry.action).toBe('string');
   expect(entry.action.length).toBeGreaterThan(5);
   expect(report.ready).toBe(false);
  }
  const noPool=evaluateIntegration({...spec,pooledHost:'host.other.example'},facts);
  expect(noPool.checks.find(x=>x.key==='pooling').status).toBe('missing');
 });
 it('makes unknown data missing instead of guessing or claiming provisioned features',()=>{
  const unknown=evaluateIntegration(spec,{...facts,
   tables:null,extensions:null,roles:null,latestMigration:null,
   authEnabled:null,dataApiEnabled:null,quota:null});
  expect(unknown.ready).toBe(false);
  expect(unknown.checks.find(x=>x.key==='table:public.widgets').status).toBe('missing');
  expect(unknown.checks.find(x=>x.key==='quota').status).toBe('missing');
 });
 it('refuses unbounded or malformed criteria',()=>{
  expect(()=>evaluateIntegration({...spec,expectedTables:Array(15).fill('public.a')},facts)).toThrow();
  expect(()=>evaluateIntegration({...spec,expectedTables:['public."; DROP']},facts)).toThrow();
  expect(()=>evaluateIntegration({...spec,expectedExtensions:['bad-name']},facts)).toThrow();
 });
});