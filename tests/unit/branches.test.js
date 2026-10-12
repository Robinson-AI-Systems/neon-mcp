import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch,devEndpoint,database,role,responses} from '../../test/helpers/neon-fixtures.js';
import {projectScope} from '../../src/tools/project-context.js';
import {createBranchReadHandlers,tools} from '../../src/tools/branches.js';
const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'}};
const json=r=>JSON.parse(r.content[0].text);
function setup(){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_D2_branches_fixture',orgId:IDS.org,fetch:fake.fetch,
  budget:{async consume(){return {allowed:true};}}});
 return {fake,handlers:createBranchReadHandlers({getClient:async(c,p)=>({
  client,scope:projectScope(c,p)})})};
}
describe('D-2 scoped branch reads',()=>{
 it('declares two bounded read-only tools with closed schemas',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_branch_list','neon_branch_get','neon_branch_compare_schema']);
  for(const t of tools){
   expect(t.writes).toBe(false);expect(t.profiles).toContain('read_only');
   expect(t.inputSchema.additionalProperties).toBe(false);
  }
 });
 it('lists verified project branches, never provider secret fields',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('listProjectBranches').resolves({branches:[mainBranch(),devBranch()],annotations:{}});
  const result=json(await handlers.neon_branch_list({projectId:IDS.project},ctx));
  expect(result.branches).toHaveLength(2);
  expect(result.branches[0]).toMatchObject({default:true,protected:true});
  expect(JSON.stringify(result)).not.toMatch(/password|proxy_host|connection_uri|napi_FAKE/);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('rejects a foreign branch before exposing results',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('listProjectBranches').resolves({branches:[devBranch({project_id:'proj-fake-other'})],annotations:{}});
  await expect(handlers.neon_branch_list({},ctx)).rejects.toThrow(/different project/);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('rejects cross-project input before any network call',async()=>{
  const {fake,handlers}=setup();
  await expect(handlers.neon_branch_list({projectId:'proj-fake-other'},ctx)).rejects.toThrow(/scope/);
  expect(fake.calls).toHaveLength(0);
 });
 it('gets branch with endpoints, databases and roles without URI or password',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[devEndpoint()]});
  fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.dev)]});
  fake.when('listProjectBranchRoles').resolves({roles:[role(IDS.dev)]});
  const result=json(await handlers.neon_branch_get({projectId:IDS.project,branchId:IDS.dev},ctx));
  expect(result.branch).toMatchObject({id:IDS.dev,parentId:IDS.main});
  expect(result.computes).toHaveLength(1);
  expect(result.databases[0].name).toBe('neondb');
  expect(result.roles[0].name).toBe('neondb_owner');
  expect(JSON.stringify(result)).not.toMatch(/password|proxy_host|\.neon\.tech|connection_uri/);
  expect(fake.calls.map(c=>c.method)).toEqual(['GET','GET','GET','GET','GET']);
  fake.assertClean();
 });
 it('compares exact, verified branches with required database, GET only',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'))
   .resolves(responses.getProjectBranch('main'));
  fake.when('getProjectBranchSchemaComparison').resolves({diff:'ALTER TABLE public.jobs ADD COLUMN note text;'});
  const out=json(await handlers.neon_branch_compare_schema({
   projectId:IDS.project,branchId:IDS.dev,baseBranchId:IDS.main,database:'neondb'},ctx));
  expect(out.changed).toBe(true);
  expect(out.diff).toContain('ALTER TABLE');
  expect(fake.calls.at(-1).query).toMatchObject({base_branch_id:IDS.main,db_name:'neondb'});
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('rejects missing schema database or forged branch identity before compare',async()=>{
  const {fake,handlers}=setup();
  await expect(handlers.neon_branch_compare_schema({branchId:IDS.dev,baseBranchId:IDS.main},ctx))
   .rejects.toThrow(/database/);
  expect(fake.calls).toHaveLength(0);
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('main'));
  await expect(handlers.neon_branch_compare_schema({
   projectId:IDS.project,branchId:IDS.dev,baseBranchId:IDS.main,database:'neondb'},ctx))
   .rejects.toThrow(/identity/);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses malformed branch IDs and organization mismatch',async()=>{
  const {fake,handlers}=setup();
  await expect(handlers.neon_branch_get({branchId:'INVALID!'},ctx)).rejects.toThrow(/branch ID/);
  fake.when('getProject').resolves({project:project({org_id:'org-fake-other'})});
  await expect(handlers.neon_branch_get({branchId:IDS.dev},ctx)).rejects.toThrow(/project identity/);
  expect(fake.calls).toHaveLength(1);
  fake.assertClean();
 });
});
