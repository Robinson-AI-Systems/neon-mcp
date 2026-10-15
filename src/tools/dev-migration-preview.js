// V-3 migration rehearsal: checked owner-run target, private B-3c child only.
// No statement generated here is executed on its selected parent.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {verifyConnectionTarget} from './connections.js';
import {ownedDevTarget} from '../dev/owned-run.js';
import {compileMigrationPreview,TABLE_SIZE_SQL,PRISMA_SQL} from '../dev/migration-plan.js';
import {fetchPublicSource} from '../dev/public-source.js';
import {runAuthorizedSqlRead} from '../neon/sql-read.js';
import {createSqlExactPreview} from '../neon/sql-preview.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';
import {projectRead} from './project-context.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const db={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const run={type:'string',pattern:'^[a-z0-9-]{4,64}$'};
const schema={type:'object',additionalProperties:false,properties:{
 projectId:id,branchId:id,runId:run,endpointId:id,databaseName:db,roleName:db,
 schemaName:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,62}$'},
 migrations:{type:'array',minItems:1,maxItems:10,items:{
  type:'object',additionalProperties:false,
  properties:{name:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'},
   url:{type:'string',minLength:12,maxLength:2048}},required:['name','url']}},
 statements:{type:'array',minItems:1,maxItems:20,items:{
  type:'string',minLength:1,maxLength:20000}},
 keep:{type:'boolean'},allowFullTable:{type:'boolean'},
 dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}},
 required:['projectId','branchId','runId','endpointId','databaseName','roleName']};
const parse=r=>JSON.parse(r.content[0].text);
async function scopedRead(c,target,sqlLayer,text,params){
 const response=await runAuthorizedSqlRead({ctx:c,target,text,params,sqlLayer});
 if(response?.done!==true||response.truncated===true||
    !Array.isArray(response.rows))throw Error('Complete bounded migration metadata unavailable');
 return response.rows;
}
async function recordKeptChild({ctx,args,detail}){
 const {projectId,branchId,parentBranchId,expiresAt,neonClient}=detail;
 if(projectId!==args.projectId||parentBranchId!==args.branchId||
    typeof branchId!=='string'||branchId===args.branchId||
    !Number.isFinite(Date.parse(expiresAt))||
    Date.parse(expiresAt)>Date.now()+3601000)
  return false;
 const data=await projectRead(neonClient,'getProjectBranch',{
  path:{project_id:projectId,branch_id:branchId}});
 const actual=data?.branch;
 if(actual?.id!==branchId||actual.project_id!==projectId||
    actual.parent_id!==args.branchId||actual.protected===true||
    actual.default===true||Date.parse(actual.expires_at)!==Date.parse(expiresAt))
  return false;
 const orgId=ctx.connection.neonOrg;
 const inserted=await ctx.db.recordDevRunBranch?.({
  orgId,projectId,runId:args.runId,branchId,parentId:args.branchId,
  expiresAt:actual.expires_at});
 if(inserted!==true)return false;
 const rows=await ctx.db.listDevRunObjects?.({
  orgId,projectId,runId:args.runId});
 return Array.isArray(rows)&&rows.length<=100&&rows.some(x=>
  x.object_type==='branch'&&x.object_id===branchId&&
  x.run_id===args.runId&&x.cleaned===false);
}
export function createDevMigrationHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env}),
 previewRunner=createSqlExactPreview,fetchFile=fetchPublicSource,
 makePlan=null,saveKeptChild=recordKeptChild
}={}){
 async function current(a,c){
  const state=await ownedDevTarget(a,c,verifyTarget,{requireAppFree:true});
  return state;
 }
 async function planFor(a,c,target,key){
  if(makePlan)return makePlan({args:a,ctx:c,target,requestKey:key});
  const policy=await c.db.getDevSettings?.();
  if(!policy||!Number.isSafeInteger(policy.ttl_hours)||policy.ttl_hours<1||
     policy.ttl_hours>720)throw Error('Verified development setting unavailable');
  const lockWarnRows=policy.lock_warn_rows??100000;
  const sqlLayer=sqlFactory(c);
  const read=(text,params)=>scopedRead(c,target,sqlLayer,text,params);
  return compileMigrationPreview({args:a,requestKey:key,lockWarnRows,
   loadApplied:async schemaName=>read(PRISMA_SQL(schemaName),[]),
   loadSizes:async schemaName=>read(TABLE_SIZE_SQL,[schemaName]),
   fetchFile:async url=>fetchFile(url,{allowSql:true,maxBytes:131072})});
 }
 async function checkedMigrationPlan(a,c,target,key){
  const result=await planFor(a,c,target,key);
  if(!result||!Array.isArray(result.statements)||
     result.statements.length<1||result.statements.length>20||
     !Array.isArray(result.summary)||result.summary.length!==result.statements.length||
     result.summary.some(x=>typeof x?.root!=='string')||
     !Array.isArray(result.params)||result.params.length!==result.statements.length||
     typeof result.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(result.fingerprint))
   throw Error('Complete verified migration plan and diagnostics required');
  return result;
 }
 const write=defineWrite({
  name:'neon_dev_migration_preview',productionEffect:'none',
  destructive:true,
  // B-4 reserves a conservative one-cent preliminary cost admission; it
  // never claims actual metered compute is fixed-price or owner-approved.
  spend:async()=>({increaseCents:1,estimate:true,canApply:true}),
  plan:async(a,c)=>{
   const state=await current(a,c);
   const key=c.writeKey('neon_dev_migration_preview',a);
   const migration=await checkedMigrationPlan(a,c,state.target,key);
   if(migration.anyFullTable&&a.allowFullTable!==true)
    throw Error('Unbounded migration statements require explicit child-only acknowledgment');
   return {projectId:a.projectId,branchId:a.branchId,
    target:'dev-migration-preview:'+a.projectId+'/'+a.branchId,
    before:{...state,migration,requestKey:key},
    summary:'Rehearse '+migration.statements.length+' validated migration statements'+
      ' ('+migration.alreadyApplied.length+' already applied) on an isolated expiring'+
      ' child of recorded run '+a.runId+'; NEVER write the selected branch.'+
      ' Warn about '+migration.warnings.length+' table locks. '+
      (a.keep===true?'Retain verified one-hour run-owned child;':
       'Delete the disposable child after exact rehearsal;')+
      ' owner spending permission is separately required.'};
  },
  apply:async(a,c,{before,requestKey})=>{
   const state=await current(a,c);
   if(JSON.stringify(state)!==JSON.stringify({
    target:before.target,expiry:before.expiry})||requestKey!==before.requestKey)
    throw Error('Development branch or run changed since preview');
   const migration=await checkedMigrationPlan(a,c,state.target,requestKey);
   if(migration.fingerprint!==before.migration.fingerprint||
      migration.anyFullTable&&a.allowFullTable!==true)
    throw Error('Migrations, history, lock policy or source changed since preview');
   const keep=a.keep===true,client=await c.clientFor(a.projectId);
   const output=await previewRunner({
    ctx:{...c,checkApp:async target=>
     c.guards.checkApp(target,c,{...a,outsideApp:false}),
     previewAdmission:async()=>true,
     allowFullTable:a.allowFullTable===true},
    target:state.target,statements:migration.statements,
    params:migration.params,requestKey,neonClient:client,sqlLayer:sqlFactory(c),
    captureDiagnostics:true,keepChild:keep,recordChild:keep?detail=>saveKeptChild({
     ctx:c,args:a,detail}):null});
   if(output?.done!==true||output.exact!==true||
      (keep?output?.childKept!==true:output?.childDeleted!==true)||
      !Array.isArray(output.statementDurationsMs)||
      output.statementDurationsMs.length!==migration.statements.length||
      output.statementDurationsMs.some(ms=>!Number.isSafeInteger(ms)||ms<0)||
      migration.summary.some(x=>x.root!=='InsertStmt'&&x.root!=='UpdateStmt'&&
       x.root!=='DeleteStmt')&&typeof output.schemaDiff!=='string'){
    c.currentDevMigrationFailure=output?.sqlFailure??null;
    return {confirmed:'pending'};
   }
   c.currentDevMigration={
    success:true,kept:keep,branchId:keep?output.childBranchId:null,
    childExpiresAt:keep?output.childExpiresAt:null,
    affectedRows:output.affectedRows,schemaChanged:output.schemaChanged,
    warnings:migration.warnings,alreadyApplied:migration.alreadyApplied,
    pendingMigrations:migration.filenames,statementCount:migration.statements.length,
    statementDurationsMs:output.statementDurationsMs,schemaDiff:output.schemaDiff,
    schemaHash:output.schemaHash};
   return {confirmed:true};
  },
  readAfter:async(_a,c)=>c.currentDevMigration??null,
  verify:async(before,after)=>after?.success===true&&
   after.statementCount===before.migration.statements.length&&
   Array.isArray(after.affectedRows)&&
   after.affectedRows.length===before.migration.statements.length
 });
 const tool={...write.tool,inputSchema:schema,area:'developer',
  audience:['owner','builder'],profiles:['full'],
  description:'Owner-priced, AST-validated Prisma-pending or inline SQL migration rehearsal on a disposable expiring dev child; never mutates parent.'};
 return {tools:[tool],handlers:{async neon_dev_migration_preview(a,raw){
  const ctx=await contextFor(raw);
  const response=await write.handler(a,ctx);
  const result=parse(response);
  if(result?.done===true&&ctx.currentDevMigration){
   const x=ctx.currentDevMigration;
   response.content[0].text=JSON.stringify({...result,
    migrationPreview:{kept:x.kept,
     ...(x.kept?{branchId:x.branchId,expiresAt:x.childExpiresAt}:{}),
     affectedRows:x.affectedRows,schemaChanged:x.schemaChanged,
     lockWarnings:x.warnings,statementDurationsMs:x.statementDurationsMs,
     schemaDiff:x.schemaDiff,schemaHash:x.schemaHash,
     alreadyApplied:x.alreadyApplied,
     pendingMigrations:x.pendingMigrations,statementCount:x.statementCount}});
  }
  if(result?.confirmed==='pending'&&ctx.currentDevMigrationFailure)
   response.content[0].text=JSON.stringify({...result,
    migrationError:ctx.currentDevMigrationFailure});
  return response;
 }}};
}
const built=createDevMigrationHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
