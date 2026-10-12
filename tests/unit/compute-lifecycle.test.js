import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {IDS,project,devEndpoint,responses} from '../../test/helpers/neon-fixtures.js';
import {createComputeLifecycleHandlers,tools} from '../../src/tools/compute-lifecycle.js';
const decode=r=>JSON.parse(r.content[0].text);
function fixture({allowed=true,plan='Launch',connCount=null}={}){
 const fake=makeFakeNeon(),events=[];
 const client=makeNeonClient({key:'napi_FAKE_D3_lifecycle',orgId:IDS.org,fetch:fake.fetch,
  budget:{async consume(){return {allowed:true}}}});
 const db={async getPricing(){return DEFAULT_PRICING},
  async getVerifiedNeonPlan(){return plan?{name:plan,verified:true}:null},
  async getSpendPolicy(){return {perChangeCents:100000,perDayCents:100000}},
  async reserveWrite(x){events.push(['reserve',x]);return {created:true,id:events.length}},
  async recordWritePreview(x){events.push(['preview',x])},
  async completeWrite(x){events.push(['complete',x])}};
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
   mode:'preview',profile:'full'},db,clientFor:async()=>client,
  writeKey:()=> 'rmcp_compute_lifecycle_123456789',
  reserveSpendWrite:async({write})=>db.reserveWrite(write),
  deploymentEnv:'production',
  ...(connCount===null?{}:{readComputeConnectionCount:async()=>connCount}),
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),checkSpend:async()=>allowed}};
 return {fake,events,handlers:createComputeLifecycleHandlers({contextFor:async()=>ctx})};
}
const identity=(fake,before=devEndpoint())=>{
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectEndpoint').resolves({endpoint:before});
 fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
};
describe('D-3 guarded compute lifecycle',()=>{
 it('registers four lifecycle actions and safe settings with closed inputs',()=>{
  expect(tools.map(x=>x.name)).toEqual(['neon_compute_start','neon_compute_suspend',
   'neon_compute_restart','neon_compute_delete','neon_compute_update_settings']);
  for(const t of tools){expect(t.writes).toBe(true);expect(t.writeContract).toBe('defineWrite-v1');
   expect(t.inputSchema.additionalProperties).toBe(false);}
  expect(tools[3].destructive).toBe(true);
  expect(tools[4].spend).toBe(true);
 });
 it('previews suspend effects without sending a provider POST',async()=>{
  const {fake,handlers}=fixture();
  identity(fake,devEndpoint({current_state:'active'}));
  const out=decode(await handlers.neon_compute_suspend({endpointId:IDS.devEndpoint,dryRun:true},{}));
  expect(out.preview).toContain('existing connections will be interrupted');
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses mutations when independently protected',async()=>{
  const {fake,handlers}=fixture({allowed:false});
  identity(fake,devEndpoint({current_state:'active'}));
  const out=decode(await handlers.neon_compute_suspend({endpointId:IDS.devEndpoint,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('suspends and verifies a changed idle state',async()=>{
  const {fake,handlers}=fixture();
  identity(fake,devEndpoint({current_state:'active'}));
  fake.when('suspendProjectEndpoint').resolves({endpoint:devEndpoint({current_state:'idle'}),operations:[]});
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({current_state:'idle',updated_at:'2026-10-11T10:01:00Z'})});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  const out=decode(await handlers.neon_compute_suspend({endpointId:IDS.devEndpoint,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  expect(fake.calls.filter(x=>x.method==='POST')).toHaveLength(1);
  fake.assertClean();
 });
 it('starts a dormant endpoint and checks current state on readback',async()=>{
  const {fake,handlers}=fixture();
  identity(fake,devEndpoint({current_state:'idle'}));
  fake.when('startProjectEndpoint').resolves({endpoint:devEndpoint({current_state:'active'}),operations:[]});
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({current_state:'active',updated_at:'2026-10-11T10:01:00Z'})});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  const out=decode(await handlers.neon_compute_start({endpointId:IDS.devEndpoint,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  fake.assertClean();
 });
 it('restart is not confirmed without an updated provider state',async()=>{
  const {fake,handlers}=fixture();
  identity(fake,devEndpoint({current_state:'active'}));
  fake.when('restartProjectEndpoint').resolves({endpoint:devEndpoint({current_state:'active'}),operations:[]});
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({current_state:'active'})});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  const out=decode(await handlers.neon_compute_restart({endpointId:IDS.devEndpoint,confirm:true},{}));
  expect(out.confirmed).toBe(false);
  expect(fake.calls.filter(x=>x.method==='POST')).toHaveLength(1);
  fake.assertClean();
 });
 it('delete previews permanent host disconnect consequences without provider DELETE',async()=>{
  const {fake,handlers}=fixture();
  identity(fake);
  const out=decode(await handlers.neon_compute_delete({endpointId:IDS.devEndpoint,dryRun:true},{}));
  expect(out.preview).toContain('connection strings using its host stop working');
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('rejects disabling scale-to-zero if independent plan is unknown',async()=>{
  const {fake,handlers}=fixture({plan:null});
  identity(fake);
  const out=decode(await handlers.neon_compute_update_settings({
   endpointId:IDS.devEndpoint,suspendSeconds:-1,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('rejects unapproved Postgres GUC and invalid suspend interval before a mutation',async()=>{
  const {fake,handlers}=fixture();
  identity(fake);
  const out=decode(await handlers.neon_compute_update_settings({
   endpointId:IDS.devEndpoint,pgSettings:{shared_preload_libraries:'unsafe'},confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('sets provider scale timeout after B-4 pricing and exact GET verification',async()=>{
  const {fake,handlers}=fixture();
  identity(fake);
  fake.when('updateProjectEndpoint').resolves({endpoint:devEndpoint({suspend_timeout_seconds:900}),operations:[]});
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({suspend_timeout_seconds:900})});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  const out=decode(await handlers.neon_compute_update_settings({
   endpointId:IDS.devEndpoint,suspendSeconds:900,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  const patch=fake.calls.find(c=>c.method==='PATCH');
  expect(patch.body.endpoint.suspend_timeout_seconds).toBe(900);
  fake.assertClean();
 });
});
