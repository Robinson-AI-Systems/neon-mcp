import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {IDS,project,mainEndpoint,devEndpoint,devBranch,operation} from '../../test/helpers/neon-fixtures.js';
import {createComputeReadHandlers,tools} from '../../src/tools/computes.js';
const decode=r=>JSON.parse(r.content[0].text);
const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'},
 db:{async getPricing(){return DEFAULT_PRICING}}};
function setup(){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_D3_reads',orgId:IDS.org,fetch:fake.fetch,
  budget:{async consume(){return {allowed:true}}}});
 return {fake,handlers:createComputeReadHandlers({getClient:async()=>({client})})};
}
describe('D-3 scoped compute discovery',()=>{
 it('exposes three read-only closed descriptors',()=>{
  expect(tools.map(x=>x.name)).toEqual(['neon_compute_list','neon_compute_get','neon_compute_estimate_cost']);
  expect(tools.every(x=>x.writes===false&&x.inputSchema.additionalProperties===false)).toBe(true);
 });
 it('lists only safe compute fields after project and branch verification',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves({branch:devBranch(),annotation:{object:{type:'console/branch',id:IDS.dev},value:{}}});
  fake.when('listProjectEndpoints').resolves({endpoints:[mainEndpoint(),devEndpoint()]});
  const out=decode(await handlers.neon_compute_list({branchId:IDS.dev},ctx));
  expect(out.computes).toHaveLength(1);
  expect(out.computes[0]).toMatchObject({id:IDS.devEndpoint,branchId:IDS.dev});
  expect(JSON.stringify(out)).not.toMatch(/host|password|uri|proxy|\.neon\.tech/i);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('gets a single matching endpoint and filters scoped operation history',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint()});
  fake.when('listProjectOperations').resolves({operations:[
   operation({branchId:IDS.dev,endpointId:IDS.devEndpoint}),
   operation({branchId:IDS.main,endpointId:IDS.mainEndpoint})]});
  const out=decode(await handlers.neon_compute_get({endpointId:IDS.devEndpoint},ctx));
  expect(out.compute.id).toBe(IDS.devEndpoint);
  expect(out.operations).toHaveLength(1);
  expect(JSON.stringify(out)).not.toMatch(/host|password|proxy_host|connection_uri/);
  fake.assertClean();
 });
 it('refuses foreign endpoint or connection project without a write',async()=>{
  const {fake,handlers}=setup();
  await expect(handlers.neon_compute_list({projectId:'proj-fake-other'},ctx))
   .rejects.toThrow(/scope/);
  expect(fake.calls).toHaveLength(0);
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({project_id:'proj-fake-other'})});
  await expect(handlers.neon_compute_get({endpointId:IDS.devEndpoint},ctx))
   .rejects.toThrow(/identity/);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('quotes hypothetical costs from validated stored pricing, not as spend approval',async()=>{
  const {handlers}=setup();
  const out=decode(await handlers.neon_compute_estimate_cost({
   plan:'Launch',minCu:0.25,maxCu:1,hoursPerDay:24},ctx));
  expect(out.minMonthlyCents).toBe(1935);
  expect(out.maxMonthlyCents).toBe(7738);
  expect(out.authorizesSpending).toBe(false);
  expect(out.priceCheckedAt).toBe(DEFAULT_PRICING.checkedAt);
 });
});
