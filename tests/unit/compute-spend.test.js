import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {IDS,project,devBranch,devEndpoint,responses} from '../../test/helpers/neon-fixtures.js';
import {createComputeSpendHandlers,tools} from '../../src/tools/compute-spend.js';
const parse=r=>JSON.parse(r.content[0].text);
function make({allowed=true,plan='Launch'}={}){
 const fake=makeFakeNeon(),events=[];
 const client=makeNeonClient({key:'napi_FAKE_D3_spending',orgId:IDS.org,fetch:fake.fetch,
  budget:{async consume(){return {allowed:true}}}});
 const db={async getPricing(){return DEFAULT_PRICING},
  async getSpendPolicy(){return {perChangeCents:100000,perDayCents:100000}},
  async getVerifiedNeonPlan(){return plan?{verified:true,name:plan}:null},
  async recordWritePreview(v){events.push(['preview',v])},
  async reserveWrite(v){events.push(['reserve',v]);return {created:true,id:events.length}},
  async completeWrite(v){events.push(['complete',v])}};
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,mode:'preview',profile:'full'},
  db,clientFor:async()=>client,writeKey:()=> 'rmcp_compute_spend_123456789',
  reserveSpendWrite:async({write})=>db.reserveWrite(write),deploymentEnv:'production',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),checkSpend:async()=>allowed}};
 return {fake,events,handlers:createComputeSpendHandlers({contextFor:async()=>ctx})};
}
const withProject=f=>f.when('getProject').resolves({project:project()});
describe('D-3 guarded compute spend',()=>{
 it('registers closed, full-profile audited write schemas',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_compute_create','neon_compute_resize']);
  for(const t of tools){expect(t.writes).toBe(true);
   expect(t.spend).toBe(true);expect(t.inputSchema.additionalProperties).toBe(false);
   expect(t.profiles).toEqual(['full']);}
 });
 it('refuses malformed CU and missing endpoint without network requests',async()=>{
  const {fake,handlers}=make();
  const out=parse(await handlers.neon_compute_create({branchId:IDS.dev,
   type:'read_only',minCu:1,maxCu:0.5,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls).toHaveLength(0);
 });
 it('previews billable endpoint creation without mutating provider',async()=>{
  const {fake,handlers}=make();
  withProject(fake);
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[]});
  const out=parse(await handlers.neon_compute_create({branchId:IDS.dev,
   type:'read_only',minCu:0.25,maxCu:0.5,dryRun:true},{}));
  expect(out.done).toBe(false);
  expect(out.spendMonthCents).toBeGreaterThan(0);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('creates one endpoint through vendored operation then verifies provider read-back',async()=>{
  const {fake,handlers}=make();
  const endpoint=devEndpoint({type:'read_only',
   autoscaling_limit_min_cu:0.25,autoscaling_limit_max_cu:0.5});
  withProject(fake);
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[]});
  fake.when('createProjectEndpoint').resolves({endpoint,operations:[]});
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectEndpoint').resolves({endpoint});
  const out=parse(await handlers.neon_compute_create({branchId:IDS.dev,
   type:'read_only',minCu:0.25,maxCu:0.5,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  const posts=fake.calls.filter(c=>c.method==='POST');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.endpoint).toMatchObject({branch_id:IDS.dev,type:'read_only',
   autoscaling_limit_min_cu:0.25,autoscaling_limit_max_cu:0.5});
  fake.assertClean();
 });
 it('refuses a second read-write endpoint on a branch',async()=>{
  const {fake,handlers}=make();
  withProject(fake);
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[devEndpoint()]});
  const out=parse(await handlers.neon_compute_create({branchId:IDS.dev,
   type:'read_write',minCu:0.25,maxCu:1,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses spending without independently verified org plan',async()=>{
  const {fake,handlers}=make({plan:null});
  withProject(fake);
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[]});
  const out=parse(await handlers.neon_compute_create({branchId:IDS.dev,
   type:'read_only',minCu:0.25,maxCu:0.5,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('resizes exact endpoint range with audited pricing and verified after-state',async()=>{
  const {fake,handlers}=make();
  withProject(fake);
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint()})
   .resolves({endpoint:devEndpoint({autoscaling_limit_min_cu:0.25,
    autoscaling_limit_max_cu:0.5})});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'))
   .resolves(responses.getProjectBranch('dev'));
  fake.when('updateProjectEndpoint').resolves({endpoint:devEndpoint({autoscaling_limit_min_cu:0.25,
   autoscaling_limit_max_cu:0.5}),operations:[]});
  fake.when('getProject').resolves({project:project()});
  const out=parse(await handlers.neon_compute_resize({endpointId:IDS.devEndpoint,
   minCu:0.25,maxCu:0.5,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  const patch=fake.calls.find(c=>c.method==='PATCH');
  expect(patch.body.endpoint).toMatchObject({autoscaling_limit_min_cu:0.25,
   autoscaling_limit_max_cu:0.5});
  fake.assertClean();
 });
 it('denied owner/protected admission never creates or resizes',async()=>{
  const {fake,handlers}=make({allowed:false});
  withProject(fake);
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[]});
  const out=parse(await handlers.neon_compute_create({branchId:IDS.dev,
   type:'read_only',minCu:0.25,maxCu:1,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
});
