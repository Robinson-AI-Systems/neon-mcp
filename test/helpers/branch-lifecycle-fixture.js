// Shared fake-Neon branch mutation fixture. Never connects to a real account.
import {makeFakeNeon} from './fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {IDS} from './neon-fixtures.js';
import {createBranchLifecycleHandlers} from '../../src/tools/branch-lifecycle.js';

export const json=result=>JSON.parse(result.content[0].text);
export function makeBranchLifecycleFixture({allowed=true,production=false,plan='Launch'}={}){
 const fake=makeFakeNeon(),events=[];
 const client=makeNeonClient({key:'napi_FAKE_D2_lifecycle_fixture',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const db={
  async getPricing(){return DEFAULT_PRICING;},
  async getSpendPolicy(){return {perChangeCents:100000,perDayCents:100000};},
  async getVerifiedNeonPlan(){return plan?{verified:true,name:plan}:null;},
  async recordWritePreview(x){events.push({kind:'preview',...x});},
  async reserveWrite(x){events.push({kind:'reserve',...x});return {created:true,id:events.length};},
  async completeWrite(x){events.push({kind:'complete',...x});}
 };
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:production?'production':'preview',profile:'full'},
  db,clientFor:async()=>client,writeKey:()=> 'rmcp_branch_lifecycle_123456789',
  reserveSpendWrite:async({write})=>db.reserveWrite(write),
  guards:{checkProtected:async()=>allowed,checkApp:async()=>true,
   checkProduction:async()=>({allowed,production}),
   checkSpend:async()=>true},deploymentEnv:'production'};
 return {fake,events,db,ctx,handlers:createBranchLifecycleHandlers({
  contextFor:async()=>ctx})};
}
