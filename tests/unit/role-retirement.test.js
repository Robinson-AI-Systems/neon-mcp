import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,database,role,devEndpoint,devBranch}
 from '../../test/helpers/neon-fixtures.js';
import {tools,createRoleRetirementHandlers} from '../../src/tools/role-retirement.js';

const read=r=>JSON.parse(r.content[0].text);
const args={projectId:IDS.project,branchId:IDS.dev,roleName:'service_reader'};
function fixture({foreign=false,duplicates=false,changed=false,pooled=true,
 profile='full',protectedRole=false,owned=true}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_retirement',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves({
  branch:devBranch(),annotation:{object:{type:'console/branch',id:IDS.dev},value:{}}});
 fake.when('getProjectBranchRole').resolves({role:role(IDS.dev,{
  name:args.roleName,protected:protectedRole})});
 const owner=owned?args.roleName:'neondb_owner';
 const databases=[database(IDS.dev,{owner_name:owner})];
 fake.when('listProjectBranchDatabases').resolves({databases:duplicates?
  [...databases,...databases]:databases});
 fake.when('listProjectBranchRoles').resolves({roles:[
  role(IDS.dev,{name:args.roleName,protected:protectedRole}),
  role(IDS.dev)]});
 const compute=devEndpoint({pooler_enabled:pooled});
 fake.when('listProjectEndpoints').resolves({endpoints:[compute]});
 fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({
  pooler_enabled:pooled,...(changed?{current_state:'active'}:{}),
  ...(foreign?{branch_id:IDS.main}:{})})});
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  profile,mode:'preview'},db:{}};
 const handlers=createRoleRetirementHandlers({getClient:async()=>({client})});
 return {fake,ctx,handlers,client};
}
describe('D-4 verified owner role retirement planning',()=>{
 it('registers a safe owner-only read and never enables role deletion',()=>{
  expect(tools.map(x=>x.name)).toEqual(['neon_role_retirement_review']);
  expect(tools[0]).toMatchObject({writes:false,profiles:['full']});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('reports verified owner databases and compute posture but never declares pooler clearance',async()=>{
  const f=fixture();
  const result=read(await f.handlers.neon_role_retirement_review(args,f.ctx));
  expect(result).toMatchObject({
   safeToDelete:false,roleDeleteRegistered:false,computeCount:1,
   ownedDatabases:['neondb'],idlePooledClients:'notObservable',
   externalConsumers:'notVerified'});
  expect(result.computes[0]).toMatchObject({id:IDS.devEndpoint,
   providerPoolerEnabled:true,idlePooledClients:'notObservable'});
  expect(f.fake.calls.every(x=>x.method==='GET'&&x.auth)).toBe(true);
  expect(f.fake.calls.some(x=>x.operationId==='getProjectEndpoint')).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/napi_FAKE|npg_FAKE|password/i);
  f.fake.assertClean();
 });
 it('never interprets a provider pooler flag of false as zero hidden clients',async()=>{
  const f=fixture({pooled:false,owned:false});
  const result=read(await f.handlers.neon_role_retirement_review(args,f.ctx));
  expect(result.computes[0].providerPoolerEnabled).toBe(false);
  expect(result.safeToDelete).toBe(false);
  expect(result.ownedDatabases).toEqual([]);
  f.fake.assertClean();
 });
 it('refuses forged compute scope or changed runtime inventory rather than fabricate coverage',async()=>{
  for(const props of [{foreign:true},{changed:true},{duplicates:true},{protectedRole:true}]){
   const f=fixture(props);
   await expect(f.handlers.neon_role_retirement_review(args,f.ctx)).rejects.toThrow();
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('denies nonowner profiles and foreign project scope before provider calls',async()=>{
  const f=fixture({profile:'read_only'});
  await expect(f.handlers.neon_role_retirement_review(args,f.ctx)).rejects.toThrow();
  expect(f.fake.calls).toHaveLength(0);
  const g=fixture();
  await expect(g.handlers.neon_role_retirement_review({
   ...args,projectId:'proj-foreign'},g.ctx)).rejects.toThrow();
  expect(g.fake.calls).toHaveLength(0);
 });
});


describe('D-4 owner opt-in live PostgreSQL dependency read',()=>{
 it('declares strict paired monitor target without adding a write tool',()=>{
  const properties=tools[0].inputSchema.properties;
  expect(properties.monitorDatabase).toBeDefined();
  expect(properties.monitorRole).toBeDefined();
  expect(tools[0].writes).toBe(false);
 });
 it('refuses partial monitor and same subject role before any project GET',async()=>{
  for(const extra of [
   {monitorRole:'neondb_owner'},
   {monitorDatabase:'neondb'},
   {monitorRole:args.roleName,monitorDatabase:'neondb'}
  ]){
   const f=fixture();
   await expect(f.handlers.neon_role_retirement_review({...args,...extra},f.ctx))
    .rejects.toThrow(/separate monitoring/);
   expect(f.fake.calls).toHaveLength(0);
  }
 });
 it('observes only verified bound per-compute counters while pooled clients remain unknown',async()=>{
  const f=fixture({owned:false,pooled:false});
  const report={verified:true,projectId:IDS.project,branchId:IDS.dev,
   roleName:args.roleName,monitorRole:'neondb_owner',monitorDatabase:'neondb',
   poolerClientsVerified:false,postgresDependenciesClear:true,
   computes:[{endpointId:IDS.devEndpoint}],
   totals:{objectReferences:0,databaseOwnerships:0,roleMemberships:0,activeSessions:0}};
  const handlers=createRoleRetirementHandlers({
   getClient:async()=>({client:f.client}),
   contextFor:async c=>c,inspectDependencies:async()=>report});
  // A single identity provider read path must remain exactly GET-only.
  const output=read(await handlers.neon_role_retirement_review({...args,
   monitorRole:'neondb_owner',monitorDatabase:'neondb'},f.ctx));
  expect(output).toMatchObject({safeToDelete:false,roleDeleteRegistered:false,
   idlePooledClients:'notObservable',
   postgresDependencies:{state:'observed',dependenciesClear:true,
    poolerClientsVerified:false,counts:{activeSessions:0}}});
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
});
