import {describe,it,expect} from 'vitest';
import {pricedTuningChild} from '../../src/tools/dev-tune.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import * as fx from '../../test/helpers/neon-fixtures.js';
async function fixture({verified=true,price=true,full=false}={}){
 const fake=makeFakeNeon();
 fake.when('getProject').resolves({project:fx.project({
  owner_id:fx.IDS.org,owner:{email:'owner@example.test',name:'Synthetic Owner',
   subscription_type:'launch',branches_limit:10}})});
 fake.when('listProjectBranches').resolves({branches:
  full?Array.from({length:10},(_,i)=>fx.devBranch({id:'br-fake-'+i})):
   [fx.mainBranch(),fx.devBranch()],annotations:{}});
 const neon=makeNeonClient({key:'napi_FAKE_v4_cost',orgId:fx.IDS.org,
  budget:{consume:async()=>({allowed:true})},fetch:fake.fetch});
 const db={
  getVerifiedNeonPlan:async()=>verified?{verified:true,name:'Launch'}:null,
  getSpendPolicy:async()=>({perChangeCents:5000,perDayCents:5000}),
  getPricing:async()=>price?DEFAULT_PRICING:null
 };
 return {fake,ctx:{connection:{neonOrg:fx.IDS.org,projectScope:fx.IDS.project,
  profile:'full',mode:'preview'},db,clientFor:async()=>neon}};
}
describe('V-4 source-priced metered disposable tuning branch',()=>{
 it('uses attested Neon plan and source-dated rates, not an assumed one cent',async()=>{
  const f=await fixture();
  const amount=await pricedTuningChild({projectId:fx.IDS.project},f.ctx);
  expect(amount).toMatchObject({increaseCents:1935,canApply:true,
   estimate:true,branchCount:2,verifiedTier:'Launch'});
  expect(f.fake.calls.map(x=>x.operationId)).toEqual(['getProject','listProjectBranches']);
  f.fake.assertClean();
 });
 it('refuses absent verified tier, unknown dated pricing and branch quota',async()=>{
  for(const flags of [{verified:false},{price:false},{full:true}]){
   const f=await fixture(flags);
   await expect(pricedTuningChild({projectId:fx.IDS.project},f.ctx)).rejects.toThrow();
   f.fake.assertClean();
  }
 });
});
