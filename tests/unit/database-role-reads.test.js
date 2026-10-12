import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,devBranch,database,role,responses} from '../../test/helpers/neon-fixtures.js';
import {projectScope} from '../../src/tools/project-context.js';
import {createDatabaseRoleReadHandlers,tools} from '../../src/tools/database-role-reads.js';
const json=x=>JSON.parse(x.content[0].text);
const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'}};
function setup(){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_D4_db_role',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const handlers=createDatabaseRoleReadHandlers({getClient:async(c,p)=>({
  client,scope:projectScope(c,p)})});
 const identity=()=>{
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
 };
 return {fake,handlers,identity};
}
describe('D-4 verified database and role discovery',()=>{
 it('exposes four read-only, closed schema names with all profiles',()=>{
  expect(tools.map(x=>x.name)).toEqual(['neon_database_list',
   'neon_database_get','neon_role_list','neon_role_get']);
  for(const t of tools){
   expect(t.writes).toBe(false);
   expect(t.profiles).toContain('read_only');
   expect(t.inputSchema.additionalProperties).toBe(false);
  }
 });
 it('lists database owners with bounded safe summary and GET-only effects',async()=>{
  const {fake,handlers,identity}=setup();
  identity();
  fake.when('listProjectBranchDatabases').resolves({databases:[
   database(IDS.dev),database(IDS.dev,{id:3,name:'backup'})]});
  const result=json(await handlers.neon_database_list({branchId:IDS.dev,limit:1},ctx));
  expect(result.databases).toHaveLength(1);
  expect(result.databases[0]).toMatchObject({name:'neondb',owner:'neondb_owner'});
  expect(result.capped).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/connection_uri|password|proxy_host|napi_FAKE/);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('gets exact database name and owner with no cross-branch projection',async()=>{
  const {fake,handlers,identity}=setup();
  identity();
  fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev)});
  const output=json(await handlers.neon_database_get({branchId:IDS.dev,
   databaseName:'neondb'},ctx));
  expect(output.database).toMatchObject({name:'neondb',owner:'neondb_owner'});
  expect(fake.calls.at(-1).params.database_name).toBe('neondb');
  fake.assertClean();
 });
 it('lists and gets roles without exposing provider credentials or inventing grants',async()=>{
  const {fake,handlers,identity}=setup();
  identity();
  fake.when('listProjectBranchRoles').resolves({roles:[role(IDS.dev),
   role(IDS.dev,{name:'reader'})]});
  const list=json(await handlers.neon_role_list({branchId:IDS.dev,limit:1},ctx));
  expect(list.roles).toHaveLength(1);
  expect(list.capped).toBe(true);
  identity();
  fake.when('getProjectBranchRole').resolves({role:role(IDS.dev)});
  const got=json(await handlers.neon_role_get({branchId:IDS.dev,
   roleName:'neondb_owner'},ctx));
  expect(got.role).toMatchObject({name:'neondb_owner',
   privileges:null,privilegesVerified:false});
  expect(JSON.stringify({list,got})).not.toMatch(/password|connection_uri|npg_FAKE/);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses forged cross-project and malformed identifiers before provider calls',async()=>{
  const {fake,handlers}=setup();
  await expect(handlers.neon_database_list({
   projectId:'proj-fake-other',branchId:IDS.dev},ctx)).rejects.toThrow(/scope/);
  await expect(handlers.neon_role_get({branchId:IDS.dev,
   roleName:'role;DROP TABLE x'},ctx)).rejects.toThrow(/role name/);
  await expect(handlers.neon_database_get({branchId:IDS.dev,
   databaseName:'not valid!'},ctx)).rejects.toThrow(/database name/);
  expect(fake.calls).toHaveLength(0);
 });
 it('rejects provider branch mismatch or foreign record without presenting unsafe partial lists',async()=>{
  const {fake,handlers,identity}=setup();
  identity();
  fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.main)]});
  await expect(handlers.neon_database_list({branchId:IDS.dev},ctx))
   .rejects.toThrow(/inventory/);
  fake.assertClean();
  const second=setup();
  second.identity();
  second.fake.when('getProjectBranchRole').resolves({role:role(IDS.main)});
  await expect(second.handlers.neon_role_get({branchId:IDS.dev,
   roleName:'neondb_owner'},ctx)).rejects.toThrow(/identity/);
  second.fake.assertClean();
 });
 it('refuses mismatched branch identity after independent provider verification',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves({branch:devBranch({id:IDS.main}),
   annotation:{object:{type:'console/branch',id:IDS.main},value:{}}});
  await expect(handlers.neon_database_list({branchId:IDS.dev},ctx))
   .rejects.toThrow(/identity/);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
});
