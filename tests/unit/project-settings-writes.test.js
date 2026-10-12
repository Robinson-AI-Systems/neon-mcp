import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {IDS,project} from '../../test/helpers/neon-fixtures.js';
import {tools,createProjectSettingsHandlers} from '../../src/tools/project-settings-writes.js';
const json=r=>JSON.parse(r.content[0].text);
const value=(overrides={})=>project({
 default_endpoint_settings:{autoscaling_limit_min_cu:0.25,
  autoscaling_limit_max_cu:1,suspend_timeout_seconds:300},
 settings:{quota:{compute_time_seconds:10000}},...overrides
});
function setup({production=true,plan=true}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_D1e_fixture',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const writes=[];
 const db={
  async getPricing(){return DEFAULT_PRICING;},
  async getVerifiedNeonPlan(){return plan?{verified:true,name:'Launch'}:null;},
  async recordWritePreview(x){writes.push({kind:'preview',...x});},
  async reserveWrite(x){writes.push({kind:'claim',...x});return {created:true,id:writes.length};},
  async completeWrite(x){writes.push({kind:'complete',...x});}
 };
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:production?'production':'preview',profile:'full'},
  clientFor:async()=>client,db,env:{VERCEL_ENV:'production'},
  writeKey:()=> 'rmcp_d1e_settings_test_123456',
  reserveSpendWrite:async({write})=>db.reserveWrite(write),
  guards:{checkProtected:async()=>true,
   checkProduction:async()=>({allowed:production,production}),
   checkApp:async()=>true,checkSpend:async()=>true}};
 return {fake,db,ctx,writes,handlers:createProjectSettingsHandlers({
  contextFor:async()=>ctx})};
}
describe('D-1 guarded project settings, retention and quota tools',()=>{
 it('has three full-profile B-1 contracts with explicit schemas',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_project_update_settings',
   'neon_project_set_history_retention','neon_project_set_quotas']);
  for(const t of tools){
   expect(t.profiles).toEqual(['full']);
   expect(t.writes).toBe(true);
   expect(t.projectWide).toBe(true);
   expect(t.writeContract).toBe('defineWrite-v1');
   expect(t.inputSchema.additionalProperties).toBe(false);
  }
 });
 it('refuses unverified computed price and blocks any update attempt',async()=>{
  const {fake,handlers}=setup({plan:false});
  fake.when('getProject').resolves({project:value()});
  const output=json(await handlers.neon_project_update_settings({
   projectId:IDS.project,maxCu:2,confirm:true},{}));
  expect(output.done).toBe(false);
  expect(fake.calls.map(c=>c.method)).toEqual(['GET']);
  fake.assertClean();
 });
 it('previews UTC maintenance window and rejects invalid days without provider writes',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:value()});
  const window={weekdays:[1,3],startTime:'01:00',endTime:'03:00'};
  const output=json(await handlers.neon_project_update_settings({
   projectId:IDS.project,maintenanceWindow:window,dryRun:true},{}));
  expect(output.done).toBe(false);
  expect(output.spendMonthCents).toBe(0);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('confirms history shortening with provider read-back and no billing increase',async()=>{
  const {fake,handlers,writes}=setup();
  fake.when('getProject').resolves({project:value()})
   .resolves({project:value({history_retention_seconds:3600})});
  fake.when('updateProject').resolves({
   project:value({history_retention_seconds:3600}),operations:[]});
  const output=json(await handlers.neon_project_set_history_retention({
   projectId:IDS.project,seconds:3600,confirm:true},{}));
  expect(output.confirmed).toBe(true);
  expect(fake.calls.filter(c=>c.method==='PATCH')).toHaveLength(1);
  expect(writes.some(w=>w.kind==='complete'&&w.confirmed==='true')).toBe(true);
  fake.assertClean();
 });
 it('blocks unverified retention expansion before any provider mutation',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:value()});
  const result=json(await handlers.neon_project_set_history_retention({
   projectId:IDS.project,seconds:172800,confirm:true},{}));
  expect(result.done).toBe(false);
  expect(fake.calls.map(c=>c.method)).toEqual(['GET']);
  fake.assertClean();
 });
 it('tightens a quota while preserving existing other quotas and verifies read-back',async()=>{
  const {fake,handlers}=setup();
  const before=value({settings:{quota:{compute_time_seconds:10000,
   data_transfer_bytes:900000}}});
  const after=value({settings:{quota:{compute_time_seconds:5000,
   data_transfer_bytes:900000}}});
  fake.when('getProject').resolves({project:before}).resolves({project:after});
  fake.when('updateProject').resolves({project:after,operations:[]});
  const output=json(await handlers.neon_project_set_quotas({
   projectId:IDS.project,quota:{compute_time_seconds:5000},confirm:true},{}));
  expect(output.confirmed).toBe(true);
  expect(fake.calls.find(c=>c.method==='PATCH').body.project.settings.quota)
   .toEqual({compute_time_seconds:5000,data_transfer_bytes:900000});
  fake.assertClean();
 });
 it('never disables or relaxes a quota from a more restrictive value',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:value()});
  const result=json(await handlers.neon_project_set_quotas({
   projectId:IDS.project,quota:{compute_time_seconds:0},confirm:true},{}));
  expect(result.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses project settings changes when production permission is off',async()=>{
  const {fake,handlers}=setup({production:false});
  fake.when('getProject').resolves({project:value()});
  const output=json(await handlers.neon_project_set_quotas({
   projectId:IDS.project,quota:{compute_time_seconds:5000},confirm:true},{}));
  expect(output.code).toBe('refused_by_guard');
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
});
