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
export function createDevTuneHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env}),
 previewRunner=createSqlExactPreview
}={}){
 async function current(a,c){
  return ownedDevTarget(a,c,verifyTarget,{requireAppFree:true});
 }
 const write=defineWrite({name:'neon_dev_tune_query',
  productionEffect:'none',destructive:true,
  // B-4 owner approval and atomic one-cent preliminary reservation for a
  // metered disposable branch. No independent automatic spend allowance.
  spend:async()=>({increaseCents:1,estimate:true,canApply:true}),
  plan:async(a,c)=>{
   const state=await current(a,c);
   const key=c.writeKey('neon_dev_tune_query',a);
   const plan=await compileTunePlan({query:a.query,params:a.params,requestKey:key});
   return {projectId:a.projectId,branchId:a.branchId,
    target:'dev-tune:'+a.projectId+'/'+a.branchId,
    before:{...state,plan,requestKey:key},
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
