// V-4: create only expiry-bound, provider-anonymized, run-owned developer
// copies. Raw data is NEVER returned or offered for connection while masking.
import {createHash} from 'node:crypto';
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {verifyConnectionTarget} from './connections.js';
import {verifiedProject,allBranches,config,expiry} from './dev-runs.js';
import {attestedProjectPlan} from './branch-lifecycle.js';
import {classifyTarget} from '../neon/production.js';
import {createSpendGuard} from '../neon/spend.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectRead} from './project-context.js';
import {runAuthorizedSqlRead} from '../neon/sql-read.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';
import {MASK_COLUMNS_SQL,compileMaskPlan,MASK_PRESETS} from '../dev/masking-plan.js';
import {defineReadTool,readText} from './read-descriptors.js';
const h=x=>createHash('sha256').update(x).digest('hex');
const ID=/^[a-z0-9-]{1,60}$/;
const RUN=/^[a-z0-9-]{4,64}$/;
const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const item={type:'object',additionalProperties:false,properties:{
 schemaName:ident,tableName:ident,columnName:ident,
 preset:{type:'string',enum:MASK_PRESETS}
},required:['schemaName','tableName','columnName','preset']};
const bare={type:'object',additionalProperties:false,properties:{
 schemaName:ident,tableName:ident,columnName:ident
},required:['schemaName','tableName','columnName']};
const inputs={projectId:id,sourceBranchId:id,endpointId:id,
 databaseName:ident,roleName:ident,
 runId:{type:'string',pattern:'^[a-z0-9-]{4,64}$'},
 ttlHours:{type:'integer',minimum:1,maximum:720},
 rules:{type:'array',minItems:1,maxItems:100,items:item},
 unmasked:{type:'array',maxItems:100,items:bare},
 confirm:{type:'boolean'},dryRun:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}};
const schema={type:'object',additionalProperties:false,properties:inputs,
 required:['projectId','sourceBranchId','endpointId','databaseName',
  'roleName','runId','rules']};
async function observedSource(a,c,verifyTarget,sqlFactory,readColumns){
 if(c.connection?.profile!=='full'||!RUN.test(a.runId||'')||
    !ID.test(a.sourceBranchId||''))throw Error('Full owner and recorded run identity required');
 const info=await verifiedProject(a,c);
 const b=await allBranches(info.client,info.projectId);
 const source=b.find(x=>x.id===a.sourceBranchId);
 if(!source||source.project_id!==info.projectId)
  throw Error('Source branch identity not verified');
 const cls=await classifyTarget(c,{projectId:a.projectId,branchId:source.id});
 if(!cls.allowed)throw Error('Source classification unavailable');
 // Production copy activation must be independent of the read-only parent
 // mutation classification; cloning data can itself expose private content.
 if(cls.production){
  if(c.connection?.mode!=='production'||
     (await c.guards?.checkProduction?.({
       projectId:a.projectId,branchId:source.id,
       target:'branch:'+a.projectId+'/'+source.id
      },c,{productionEffect:'write'}))?.allowed!==true)
   throw Error('Production source copies require separately enabled owner production access');
 }
 const dbs=await projectRead(info.client,'listProjectBranchDatabases',{
  path:{project_id:a.projectId,branch_id:source.id}});
 // Neon clones every DB on a branch, not just the selected database.
 if(!Array.isArray(dbs?.databases)||dbs.databases.length!==1||
    dbs.pagination?.cursor||
    dbs.databases[0]?.branch_id!==source.id||
    dbs.databases[0]?.name!==a.databaseName)
  throw Error('Masking requires one independently verified source database');
 const matched=await verifyTarget({...a,branchId:a.sourceBranchId},c);
 if(matched?.pid!==a.projectId||matched.bid!==a.sourceBranchId||
    matched.endpointId!==a.endpointId||matched.database!==a.databaseName||
    matched.role!==a.roleName||typeof matched.endpoint?.host!=='string')
  throw Error('Exact source database and role identity unavailable');
 const target={projectId:a.projectId,branchId:source.id,
  database:a.databaseName,role:a.roleName,endpointId:a.endpointId,
  expectedEndpointHost:matched.endpoint.host,pooled:false};
 if(await c.guards?.checkProtected?.({projectId:a.projectId,branchId:source.id},c)!==true||
    await c.guards?.checkApp?.({projectId:a.projectId,branchId:source.id},c,
      {...a,outsideApp:false})!==true)
  throw Error('Protected or application-owned masking source refused');
 const rows=readColumns?await readColumns({args:a,ctx:c,target}):
  await runAuthorizedSqlRead({ctx:c,target,text:MASK_COLUMNS_SQL,
   params:[],sqlLayer:sqlFactory(c)});
 const actual=readColumns?rows:rows?.rows;
 if(!readColumns&&(rows?.done!==true||rows.truncated===true))
  throw Error('Complete bounded source-column catalog unavailable');
 const settings=config(await c.db.getDevSettings?.());
 const ttl=a.ttlHours??settings.ttl_hours;
 const key=c.writeKey('neon_dev_anonymized_copy',a);
 const mask=compileMaskPlan({rows:actual,rules:a.rules,
  unmasked:a.unmasked??[],databaseName:a.databaseName,requestKey:key});
 const name='masked-'+h(key).slice(0,22);
 if(b.some(x=>x.name===name))throw Error('An earlier masked-copy request may already exist');
 const recorded=await c.db.getDevRun?.({orgId:info.orgId,
  projectId:a.projectId,runId:a.runId});
 if(recorded?.id!==a.runId||recorded.status!=='active'||
    recorded.connection!==(c.connectionId??null))
  throw Error('An existing active, connection-owned development run is required');
 return {projectId:a.projectId,source:source.id,sourceIsProduction:cls.production,
  name,count:b.length,expiry:expiry(ttl),settings,
  plan:attestedProjectPlan(info.project,info.orgId),mask,
  runId:a.runId,requestKey:key};
}
export async function verifyMaskedState(a,c,branchId,expectation){
 const client=await c.clientFor(a.projectId);
 const data=await projectRead(client,'getProjectBranch',
  {path:{project_id:a.projectId,branch_id:branchId}});
 const branch=data?.branch;
 if(branch?.id!==branchId||branch.project_id!==a.projectId||
    branch.parent_id!==a.sourceBranchId||branch.protected===true||
    branch.default===true||
    Date.parse(branch.expires_at)!==Date.parse(expectation.expiry))
  return {valid:false,state:'unknown'};
 const status=await projectRead(client,'getAnonymizedBranchStatus',
  {path:{project_id:a.projectId,branch_id:branchId}});
 const state=status?.state;
 if(status?.branch_id!==branchId||status.project_id!==a.projectId||
    !['created','initialized','anonymizing','anonymized',
      'initialization_error','error'].includes(state))
  return {valid:false,state:'unknown'};
 const current=await projectRead(client,'getMaskingRules',
  {path:{project_id:a.projectId,branch_id:branchId}});
 const rules=current?.masking_rules;
 const expected=expectation.mask.rules;
 if(!Array.isArray(rules)||rules.length!==expected.length||
    expected.some(e=>!rules.some(r=>Object.keys(e).every(k=>r[k]===e[k]))))
  return {valid:false,state:'unknown'};
 return {valid:true,state};
}
export function createDevAnonymizedHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env}),
 readColumns=null,createBranch=applyNeonWrite,
 observe=verifyMaskedState,priceFor=null
}={}){
 const write=defineWrite({name:'neon_dev_anonymized_copy',
  productionEffect:'none',
  spend:async(a,c,before)=>{
   if(priceFor)return priceFor({args:a,ctx:c,before});
   const p=before.plan;
   if(p?.verified!==true||!['Launch','Scale'].includes(p.name)||
      before.count>=p.branchLimit)return null;
   const saved=await c.db.getVerifiedNeonPlan?.(c.connection.neonOrg);
   if(saved?.verified!==true||saved.name!==p.name)return null;
   const guard=createSpendGuard({db:c.db});
   const branch=await guard.price({kind:'branch',plan:p.name,
    before:{count:before.count},after:{count:before.count+1}});
   const compute=await guard.price({kind:'compute',plan:p.name,
    before:{maxCu:0},after:{maxCu:before.settings.compute.max_cu}});
   if(!branch?.canApply||!compute?.canApply||
      !Number.isSafeInteger(branch.increaseCents)||
      !Number.isSafeInteger(compute.increaseCents))return null;
   return {...branch,increaseCents:branch.increaseCents+compute.increaseCents,
    canApply:true};
  },
  plan:async(a,c)=>{
   const before=await observedSource(a,c,verifyTarget,sqlFactory,readColumns);
   return {projectId:before.projectId,branchId:before.source,
    target:'dev-masked-copy:'+before.projectId+'/'+before.source,
    before,summary:'Create one beta anonymized, unprotected, expiring copy '+
     before.name+' under run '+before.runId+' from verified source '+
     before.source+' with '+before.mask.maskedColumns+' of '+
     before.mask.columnsChecked+' columns masked across '+
     before.mask.tableCount+' tables. The source is read only; '+
     'no unmasked data or connection is returned. Cost needs owner approval, '+
     'and incomplete masking stays pending until independently verified.'};
  },
  apply:async(a,c,{before,requestKey})=>{
   const fresh=await observedSource(a,c,verifyTarget,sqlFactory,readColumns);
   if(requestKey!==before.requestKey||
      JSON.stringify({...fresh,expiry:before.expiry})!==JSON.stringify(before)||
      Date.parse(before.expiry)<Date.now()+300000)
    throw Error('Source, masking, quota or policy changed after approval');
   const run=await c.db.reserveDevRun?.({id:a.runId,
    orgId:c.connection.neonOrg,projectId:a.projectId,
    connectionId:c.connectionId??null});
   if(run?.id!==a.runId)throw Error('Run ownership reservation unavailable');
   const client=await c.clientFor(a.projectId);
   const body={branch_create:{branch:{name:before.name,parent_id:before.source,
    expires_at:before.expiry,protected:false,init_source:'parent-data'},
    endpoints:[{type:'read_write',
     autoscaling_limit_min_cu:before.settings.compute.min_cu,
     autoscaling_limit_max_cu:before.settings.compute.max_cu,
     suspend_timeout_seconds:before.settings.compute.suspend_seconds}]},
    annotation_value:{rtc_run:a.runId,rtc_request:requestKey},
    masking_rules:before.mask.rules,start_anonymization:true};
   const response=await createBranch({client,projectId:a.projectId,
    operationId:'createProjectBranchAnonymized',
    params:{path:{project_id:a.projectId},body},requestKey});
   if(response?.confirmed!==true)return {confirmed:'pending'};
   const created=response.data?.branch??response.data;
   const id=created?.id;
   if(!ID.test(id||'')||created.project_id!==a.projectId||
      id===before.source)return {confirmed:'pending'};
   const recorded=await c.db.recordDevRunBranch?.({orgId:c.connection.neonOrg,
    projectId:a.projectId,runId:a.runId,branchId:id,parentId:before.source,
    expiresAt:before.expiry});
   if(recorded!==true)return {confirmed:'pending'};
   c.maskedBranchId=id;
   c.maskedExpectation=before;
   const state=await observe(a,c,id,before);
   if(!state.valid||state.state!=='anonymized')
    return {confirmed:'pending'};
   return {confirmed:true};
  },
  readAfter:async(a,c)=>{
   if(!ID.test(c.maskedBranchId||''))return null;
   return observe(a,c,c.maskedBranchId,c.maskedExpectation);
  },
  verify:(_before,after)=>after?.valid===true&&after.state==='anonymized'
 });
 const tool={...write.tool,area:'developer',audience:['owner'],
  profiles:['full'],description:'Create an owner-confirmed expiring beta masked dev copy; require complete metadata rules and verified safe status.',
  inputSchema:schema};
 const status=defineReadTool('neon_dev_anonymized_status',
  'Read the anonymization status of a recorded run-owned branch without revealing copied data.',
  {projectId:id,branchId:id,runId:inputs.runId},
  {area:'developer',audience:['owner']});
 status.profiles=['full'];
 return {tools:[tool,status],handlers:{
  async neon_dev_anonymized_copy(a,raw){
   return write.handler(a,await contextFor(raw));
  },
  async neon_dev_anonymized_status(a,raw){
   const c=await contextFor(raw);
   if(c.connection?.profile!=='full'||!ID.test(a.projectId||'')||
      !ID.test(a.branchId||'')||!RUN.test(a.runId||''))
    throw Error('Full owner and recorded masking run required');
   const info=await verifiedProject(a,c);
   const objs=await c.db.listDevRunObjects?.({orgId:info.orgId,
    projectId:a.projectId,runId:a.runId});
   if(!Array.isArray(objs)||objs.length>100||!objs.some(x=>
     x.object_type==='branch'&&x.object_id===a.branchId&&
     x.run_id===a.runId&&x.cleaned===false))
    throw Error('Masking branch is not owned by this run');
   const status=await projectRead(info.client,'getAnonymizedBranchStatus',
    {path:{project_id:a.projectId,branch_id:a.branchId}});
   if(status?.project_id!==a.projectId||status?.branch_id!==a.branchId)
    throw Error('Masking provider status unavailable');
   if(!['created','initialized','anonymizing','anonymized',
     'initialization_error','error'].includes(status.state))
    throw Error('Unknown anonymization state');
   return readText({branchId:a.branchId,state:status.state,
    safeToConnect:false,
    next:'Check all original masking rules and the owner-run record independently before using the copy'});
  }
 }};
}
const built=createDevAnonymizedHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
