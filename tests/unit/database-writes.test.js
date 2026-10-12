import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,database,role,responses} from '../../test/helpers/neon-fixtures.js';
import {createDatabaseWriteHandlers,tools} from '../../src/tools/database-writes.js';

const result=x=>JSON.parse(x.content[0].text);
const args={branchId:IDS.dev,name:'reports',ownerName:'neondb_owner'};
function setup({allowed=true,mode='preview',profile='full',app=true}={}){
 const fake=makeFakeNeon(),events=[];
 const client=makeNeonClient({key:'napi_FAKE_D4_database',orgId:IDS.org,fetch:fake.fetch,
  budget:{async consume(){return {allowed:true}}}});
 const db={recordWritePreview:async x=>events.push(['preview',x]),
  reserveWrite:async x=>{events.push(['reserve',x]);return {created:true,id:events.length}},
  completeWrite:async x=>events.push(['complete',x])};
 const context={db,connection:{neonOrg:IDS.org,projectScope:IDS.project,mode,profile},
  clientFor:async()=>client,writeKey:()=> 'rmcp_database_write_123456789',
  deploymentEnv:'production',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>app,
   checkProduction:async()=>({allowed,production:false}),checkSpend:async()=>allowed}};
 return {fake,events,handlers:createDatabaseWriteHandlers({contextFor:async()=>context})};
}
function identity(fake){
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
}
describe('D-4 guarded database lifecycle',()=>{
 it('registers scoped B-1 owner write contracts with closed schemas',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_database_create',
   'neon_database_update','neon_database_delete']);
  for(const t of tools){
   expect(t.writes).toBe(true);
   expect(t.writeContract).toBe('defineWrite-v1');
   expect(t.inputSchema.additionalProperties).toBe(false);
   expect(t.profiles).toEqual(['full']);
  }
  expect(tools[2].destructive).toBe(true);
 });
 it('previews without changes then creates exactly one verified database',async()=>{
  const {fake,handlers,events}=setup();identity(fake);
  fake.when('getProjectBranchRole').resolves({role:role(IDS.dev)});
  fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.dev)]});
  const preview=result(await handlers.neon_database_create({...args,dryRun:true},{}));
  expect(preview.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  expect(result(await handlers.neon_database_create(args,{})).code).toBe('needs_confirmation');
  const after=database(IDS.dev,{id:3,name:'reports'});
  fake.when('createProjectBranchDatabase').resolves({database:after,operations:[]});
  fake.when('getProjectBranchDatabase').resolves({database:after});
  const done=result(await handlers.neon_database_create({...args,confirm:true},{}));
  expect(done.confirmed).toBe(true);
  const writes=fake.calls.filter(x=>x.method!=='GET');
  expect(writes).toHaveLength(1);
  expect(writes[0].body.database).toEqual({name:'reports',owner_name:'neondb_owner'});
  expect(events.some(x=>x[0]==='complete'&&x[1].confirmed==='true')).toBe(true);
  fake.assertClean();
 });
 it('renames with verified identity, exact PATCH and readback',async()=>{
  const {fake,handlers}=setup();identity(fake);
  fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev)})
   .resolves({database:database(IDS.dev,{name:'renamed'})});
  fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.dev)]});
  fake.when('updateProjectBranchDatabase').resolves({
   database:database(IDS.dev,{name:'renamed'}),operations:[]});
  const done=result(await handlers.neon_database_update({
   branchId:IDS.dev,databaseName:'neondb',name:'renamed',confirm:true},{}));
  expect(done.confirmed).toBe(true);
  expect(fake.calls.find(c=>c.method==='PATCH').body.database.name).toBe('renamed');
  fake.assertClean();
 });
 it('denies blocked owner, app and read-only profiles before mutation',async()=>{
  for(const opts of [{allowed:false},{app:false},{profile:'read_only'}]){
   const {fake,handlers}=setup(opts);identity(fake);
   fake.when('getProjectBranchRole').resolves({role:role(IDS.dev)});
   fake.when('listProjectBranchDatabases').resolves({databases:[]});
   expect(result(await handlers.neon_database_create({...args,confirm:true},{})).done)
    .toBe(false);
   expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
   fake.assertClean();
  }
 });
 it('rejects wrong org and duplicate names without provider mutation',async()=>{
  const foreign=setup();
  foreign.fake.when('getProject').resolves({project:project({org_id:'org-fake-other'})});
  foreign.fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  expect(result(await foreign.handlers.neon_database_create({...args,confirm:true},{})).done).toBe(false);
  expect(foreign.fake.calls.every(x=>x.method==='GET')).toBe(true);
  foreign.fake.assertClean();
  const dup=setup();identity(dup.fake);
  dup.fake.when('getProjectBranchRole').resolves({role:role(IDS.dev)});
  dup.fake.when('listProjectBranchDatabases').resolves({databases:[
   database(IDS.dev,{name:'reports'})]});
  expect(result(await dup.handlers.neon_database_create({...args,confirm:true},{})).done).toBe(false);
  expect(dup.fake.calls.every(x=>x.method==='GET')).toBe(true);
  dup.fake.assertClean();
 });
 it('previews irreversible deletion only after full database inventory',async()=>{
  const {fake,handlers}=setup();identity(fake);
  fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev)});
  fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.dev)]});
  const out=result(await handlers.neon_database_delete({branchId:IDS.dev,
   databaseName:'neondb',dryRun:true},{}));
  expect(out.preview).toMatch(/PERMANENTLY DELETE/);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
});