// V-4: EXPLAIN (ANALYZE, BUFFERS) and indexed comparison run only on
// a B-3c disposable child. Never create an index on the selected branch.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {verifyConnectionTarget} from './connections.js';
import {ownedDevTarget} from '../dev/owned-run.js';
import {compileTunePlan,summarizeTune} from '../dev/tuning-plan.js';
import {createSqlExactPreview} from '../neon/sql-preview.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';
import {verifiedProject,allBranches} from './dev-runs.js';
import {attestedProjectPlan} from './branch-lifecycle.js';
import {createSpendGuard} from '../neon/spend.js';
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const name={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const schema={type:'object',additionalProperties:false,properties:{
 projectId:id,branchId:id,endpointId:id,databaseName:name,roleName:name,
 runId:{type:'string',pattern:'^[a-z0-9-]{4,64}$'},
 query:{type:'string',minLength:18,maxLength:4000},
 params:{type:'array',minItems:1,maxItems:3,
  items:{type:['string','number','boolean']}},
 dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}},
 required:['projectId','branchId','endpointId','databaseName','roleName',
  'runId','query','params']};
// Source-dated B-4 estimate from the actual current Neon subscription,
// branch inventory, configured pricing and metered 0.25 CU disposable child.
// Never assume every preview costs one cent.
export async function pricedTuningChild(a,c){
 const info=await verifiedProject(a,c);
 const existing=await allBranches(info.client,info.projectId);
 const plan=attestedProjectPlan(info.project,info.orgId);
 if(!plan?.verified||!['Launch','Scale'].includes(plan.name)||
    existing.length>=plan.branchLimit)
  throw Error('Verified disposable preview branch quota unavailable');
 const saved=await c.db.getVerifiedNeonPlan?.(info.orgId);
 if(saved?.verified!==true||saved.name!==plan.name)
  throw Error('Current verified Neon price tier unavailable');
 const price=createSpendGuard({db:c.db});
 const branch=await price.price({kind:'branch',plan:plan.name,
  before:{count:existing.length},after:{count:existing.length+1}});
 const compute=await price.price({kind:'compute',plan:plan.name,
  before:{maxCu:0},after:{maxCu:0.25}});
 if(!branch?.canApply||!compute?.canApply||
    !Number.isSafeInteger(branch.increaseCents)||
    !Number.isSafeInteger(compute.increaseCents))
  throw Error('Source-dated disposable preview price unavailable');
 return {increaseCents:branch.increaseCents+compute.increaseCents,
  estimate:true,canApply:true,branchCount:existing.length,
  verifiedTier:plan.name};
}
export function createDevTuneHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env}),
 previewRunner=createSqlExactPreview,estimateChildCost=pricedTuningChild
}={}){
 async function current(a,c){
  return ownedDevTarget(a,c,verifyTarget,{requireAppFree:true});
 }
 const write=defineWrite({name:'neon_dev_tune_query',
  productionEffect:'none',destructive:true,
  // B-4 source-dated provider price + durable daily capacity reservation.
  spend:async(_a,_c,before)=>before.cost,
  plan:async(a,c)=>{
   const state=await current(a,c);
   const key=c.writeKey('neon_dev_tune_query',a);
   const plan=await compileTunePlan({query:a.query,params:a.params,requestKey:key});
   const cost=await estimateChildCost(a,c);
   if(!Number.isSafeInteger(cost?.increaseCents)||!cost.canApply)
    throw Error('Verified disposable preview cost unavailable');
   return {projectId:a.projectId,branchId:a.branchId,
    target:'dev-tune:'+a.projectId+'/'+a.branchId,
    before:{...state,plan,requestKey:key,cost},
    summary:'Run a bounded SELECT EXPLAIN (ANALYZE, BUFFERS) on a one-hour'+
      ' disposable child of owned development run '+a.runId+'; create '+
      'one quoted candidate index there, compare before/after timing,'+
      ' and delete the child. Never write the selected branch.'+
      ' Owner preview spending admission is mandatory.'};
  },
  apply:async(a,c,{before,requestKey})=>{
   const now=await current(a,c);
   if(JSON.stringify(now)!==JSON.stringify({
    target:before.target,expiry:before.expiry})||
    requestKey!==before.requestKey)
    throw Error('Developer run or selected target changed since preview');
   const plan=await compileTunePlan({query:a.query,params:a.params,requestKey});
   if(plan.fingerprint!==before.plan.fingerprint)
    throw Error('Tuning query, bindings or index plan changed');
   const nowCost=await estimateChildCost(a,c);
   if(JSON.stringify(nowCost)!==JSON.stringify(before.cost))
    throw Error('Verified branch quota, pricing or cost changed since preview');
   const result=await previewRunner({
    ctx:{...c,checkApp:async target=>
     c.guards.checkApp(target,c,{...a,outsideApp:false}),
     previewAdmission:async()=>true,allowFullTable:false},
    target:now.target,statements:plan.createStatements,
    params:plan.createStatements.map(()=>[]),
    requestKey,neonClient:await c.clientFor(a.projectId),
    sqlLayer:sqlFactory(c),keepChild:false,
    tuneQuery:plan.query,tuneParams:plan.params});
   if(result?.done!==true||result.exact!==true||
      result.childDeleted!==true||
      !result.tuning?.before||!result.tuning.after)
    return {confirmed:'pending'};
   const summary=summarizeTune({before:result.tuning.before,
    after:result.tuning.after,plan});
   c.tunedReport={...summary,childDeleted:true,
    sourceBranchId:a.branchId,indexesTested:1};
   return {confirmed:true};
  },
  readAfter:async(_a,c)=>c.tunedReport??null,
  verify:(_before,after,a)=>after?.childDeleted===true&&
   after.sourceBranchId===a.branchId&&
   Number.isFinite(after.beforeMs)&&Number.isFinite(after.afterMs)
 });
 const tool={...write.tool,inputSchema:schema,
  profiles:['full'],area:'developer',audience:['owner','builder'],
  description:'Price-confirmed isolated query tuning with before/after timings and safe index suggestion; original branch unchanged.'};
 return {tools:[tool],handlers:{
  async neon_dev_tune_query(a,raw){
   const ctx=await contextFor(raw);
   const response=await write.handler(a,ctx);
   const v=JSON.parse(response.content[0].text);
   if(v?.done===true&&ctx.tunedReport){
    response.content[0].text=JSON.stringify({...v,
     tuning:{...ctx.tunedReport,
      recommendationTool:ctx.tunedReport.suggestedIndexes.length?
       'neon_schema_create_index':null}});
   }
   return response;
  }
 }};
}
const built=createDevTuneHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
