// Every real D-3 billable compute write runs the B-1 nine-case helper,
// backed by vendored-OpenAPI-validated fake Neon requests, not a stub handler.
import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {DEFAULT_PRICING,estimateMonthlyIncrease} from '../../src/neon/pricing.js';
import {IDS,project,devEndpoint,responses} from '../../test/helpers/neon-fixtures.js';
import {createComputeSpendHandlers,tools} from '../../src/tools/compute-spend.js';
import {runWriteContract} from '../../test/helpers/write-contract.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {handlers as metaHandlers,tools as metaTools} from '../../src/tools/meta.js';
import {isToolAllowed} from '../../src/core/profiles.js';

const json=x=>JSON.parse(x.content[0].text);
const inputFor=name=>name==='neon_compute_create'
 ?{branchId:IDS.dev,type:'read_only',minCu:0.25,maxCu:0.5}
 :{endpointId:IDS.devEndpoint,minCu:0.25,maxCu:1.5};

function realFixture(name,{production=false,blocked=false,appOwned=false,
 verify=true,spendCents=null}={},door='direct'){
 const fake=makeFakeNeon(),log=[];
 const client=makeNeonClient({key:'napi_FAKE_D3_shared_contract',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const initial=devEndpoint(),target=devEndpoint({
  autoscaling_limit_min_cu:0.25,autoscaling_limit_max_cu:1.5});
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
 if(name==='neon_compute_create'){
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[]});
  fake.when('createProjectEndpoint').resolves({endpoint:devEndpoint({
   type:'read_only',autoscaling_limit_max_cu:0.5}),operations:[]});
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({
   type:'read_only',autoscaling_limit_max_cu:0.5,
   ...(verify?{}:{project_id:'proj-fake-wrong-0001'})})});
 }else{
  const get=fake.when('getProjectEndpoint');
  // The default nine-case runner does dry-run, no-confirm, confirmed, replay.
  const prior=production?2:(!blocked&&!appOwned&&spendCents===null&&verify?3:1);
  for(let i=0;i<prior;i++)get.resolves({endpoint:initial});
  get.resolves({endpoint:verify?target:initial});
  if(prior===3)get.resolves({endpoint:initial}); // replay reads, but cannot reapply
  fake.when('updateProjectEndpoint').resolves({endpoint:target,operations:[]});
 }
 const db={
  async getPricing(){return DEFAULT_PRICING},
  async getVerifiedNeonPlan(){return {name:'Launch',verified:true}},
  async getSpendPolicy(){return {perChangeCents:100000,perDayCents:100000}},
  async recordWritePreview(x){log.push({kind:'preview',...x})},
  async reserveWrite(x){
   const old=log.find(z=>z.kind==='reserved'&&z.requestKey===x.requestKey);
   if(old)return {created:false,existing:{neon_org:old.orgId,tool:old.tool,
    project_id:old.projectId,branch_id:old.branchId,target:old.target,
    confirmed:old.confirmed}};
   log.push({kind:'reserved',...x,confirmed:'pending'});
   return {created:true,id:log.length};
  },
  async completeWrite(x){Object.assign(log[x.id-1],x);return true}
 };
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:'preview',profile:'full'},db,clientFor:async()=>client,
  deploymentEnv:'production',
  writeKey:()=> 'rmcp_compute_shared_abcdef123456',
  reserveSpendWrite:async({write})=>db.reserveWrite(write),
  guards:{
   checkProtected:async()=>!blocked,
   checkApp:async()=>!appOwned,
   checkProduction:async()=>({allowed:true,production}),
   checkSpend:async()=>spendCents!==2600
  }};
 const handlers=createComputeSpendHandlers({contextFor:async()=>ctx});
 const registry={tools:[...tools,...metaTools],handlers:{...handlers,...metaHandlers}};
 const through=async(args)=>dispatchReadOnlyTool({
  registry,name:door==='delegated'?'neon_call':name,
  args:door==='delegated'?{name,args}:args,
  connection:ctx.connection,db:ctx.db,env:{VERCEL_ENV:'production'}});
 return {fake,ctx,log,tool:tools.find(t=>t.name===name),
  handler:through,parse:json,
  get calls(){return fake.calls.filter(c=>['POST','PATCH','DELETE'].includes(c.method))}};
}
describe('D-3 compute write-contract acceptance through real provider handlers',()=>{
 for(const name of ['neon_compute_create','neon_compute_resize']){
  for(const door of ['direct','delegated']){
   it(name+' passes nine-case real-write contract through '+door+' MCP dispatch',async()=>{
    const fixtures=[];
    const make=opts=>{const f=realFixture(name,opts,door);fixtures.push(f);return f};
    const expected=estimateMonthlyIncrease({kind:'compute',plan:'Launch',
     before:{maxCu:name==='neon_compute_create'?0:1},
     after:{maxCu:name==='neon_compute_create'?0.5:1.5},
     pricing:DEFAULT_PRICING}).increaseCents;
    expect(expected).toBe(3869);
    await runWriteContract(make,{input:inputFor(name),expectedSpendCents:expected});
    for(const f of fixtures)f.fake.assertClean();
   });
  }
  it(name+' is excluded from unsafe profiles and preview deployments on every dispatch',async()=>{
   const f=realFixture(name);
   const tool=tools.find(t=>t.name===name);
   expect(isToolAllowed(tool,{profile:'full'},{productionDeployment:true})).toBe(true);
   for(const profile of ['read_only','everyday']){
    expect(isToolAllowed(tool,{profile},{productionDeployment:true})).toBe(false);
   }
   expect(isToolAllowed(tool,{profile:'full'},{productionDeployment:false})).toBe(false);
   const registry={tools:[tool,...metaTools],handlers:{
    [name]:f.handler,...metaHandlers
   }};
   const args={...inputFor(name),dryRun:true};
   const direct=await dispatchReadOnlyTool({registry,name,args,
    connection:f.ctx.connection,db:f.ctx.db,env:{VERCEL_ENV:'production'}});
   expect(json(direct).done).toBe(false);
   expect(json(direct).spendMonthCents).toBe(3869);
   const delegated=await dispatchReadOnlyTool({registry,name:'neon_call',
    args:{name,args},connection:f.ctx.connection,db:f.ctx.db,
    env:{VERCEL_ENV:'production'}});
   expect(delegated.isError).not.toBe(true);
   const refused=await dispatchReadOnlyTool({registry,name,args,
    connection:f.ctx.connection,db:f.ctx.db,env:{VERCEL_ENV:'preview'}});
   expect(refused.isError).toBe(true);
   const refusedDelegated=await dispatchReadOnlyTool({registry,name:'neon_call',
    args:{name,args},connection:{...f.ctx.connection,profile:'read_only'},
    db:f.ctx.db,env:{VERCEL_ENV:'production'}});
   expect(refusedDelegated.isError).toBe(true);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  });
 }
});
