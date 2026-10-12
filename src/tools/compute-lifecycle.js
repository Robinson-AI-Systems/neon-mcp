// D-3: compute lifecycle and settings remain behind audited, deny-by-default writes.
import {defineWrite} from '../core/write.js';
import {projectRead,projectScope} from './project-context.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {createSpendGuard} from '../neon/spend.js';
import {verifiedComputeTarget} from './compute-spend.js';
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const options={projectId:id,branchId:id,endpointId:id,
 confirm:{type:'boolean'},dryRun:{type:'boolean'},outsideApp:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}};
const schema=(fields={})=>({type:'object',properties:{...options,...fields},
 required:['endpointId'],additionalProperties:false});
const afterEndpoint=async(a,c)=>(await verifiedComputeTarget(a,c)).e;
async function scope(a,c){
 const {pid,client,e}=await verifiedComputeTarget(a,c);
 const info=await projectRead(client,'getProjectBranch',{
  path:{project_id:pid,branch_id:e.branch_id}});
 if(info?.branch?.id!==e.branch_id||info.branch.project_id!==pid)
  throw Error('Compute branch identity unavailable');
 return {pid,client,e,b:info.branch};
}
async function planAction(a,c,action){
 const {pid,e,b}=await scope(a,c);
 if(e.pending_state)throw Error('Compute operation already in progress');
 if(action==='start'&&e.current_state==='active')throw Error('Compute already active');
 if(action==='suspend'&&['idle','suspended'].includes(e.current_state))
  throw Error('Compute already suspended');
 let connectionCount=null;
 if(['suspend','restart'].includes(action)&&
    (b.default===true||b.protected===true)){
  if(typeof c.readComputeConnectionCount!=='function')
   throw Error('Protected compute interruption requires independently verified open connections');
  const count=await c.readComputeConnectionCount({projectId:pid,branchId:b.id,endpointId:e.id});
  if(!Number.isSafeInteger(count)||count<0)
   throw Error('A verified active connection count is required');
  connectionCount=count;
 }
 return {target:'branch:'+b.id,projectId:pid,branchId:b.id,
  before:{id:e.id,projectId:pid,branchId:b.id,state:e.current_state,
   updatedAt:e.updated_at??null},
  summary:(action==='start'?'Start ':action==='suspend'?'SUSPEND ':action==='restart'?'RESTART ':'DELETE ')+
   'compute '+e.id+'; '+
   (action==='delete'?'connection strings using its host stop working; existing connections drop':
    action==='start'?'wake compute (active compute time may incur usage costs)':
    'existing connections will be interrupted')+
   (connectionCount===null?'':'; '+connectionCount+' verified connections will disconnect')};
}
const opFor={start:'startProjectEndpoint',suspend:'suspendProjectEndpoint',
 restart:'restartProjectEndpoint',delete:'deleteProjectEndpoint'};
async function applyAction(a,c,{requestKey:key},action){
 const {pid,e}=await verifiedComputeTarget(a,c);
 return applyNeonWrite({client:await c.clientFor(pid),operationId:opFor[action],
  projectId:pid,requestKey:key,
  params:{path:{project_id:pid,endpoint_id:e.id}}});
}
async function afterDelete(a,c){
 // A deleted endpoint cannot be inspected by GET. Verify organization and a
 // complete independent project endpoint inventory instead of accepting 404.
 const pid=projectScope(c,a.projectId??null).projectId;
 if(!pid)throw Error('Scoped project required');
 const client=await c.clientFor(pid);
 const project=await projectRead(client,'getProject',{path:{project_id:pid}});
 if(project?.project?.id!==pid||project.project.org_id!==c.connection.neonOrg)
  throw Error('Project identity cannot be verified');
 const data=await projectRead(client,'listProjectEndpoints',{path:{project_id:pid}});
 if(!Array.isArray(data?.endpoints)||data.pagination?.cursor||
    data.endpoints.some(e=>e.project_id!==pid))return null;
 return {projectId:pid,missing:!data.endpoints.some(e=>e.id===a.endpointId)};
}

function definition(action){
 const def=defineWrite({name:'neon_compute_'+action,destructive:action==='delete',
  needsConfirm:action==='delete',
  plan:(a,c)=>planAction(a,c,action),
  apply:(a,c,s)=>applyAction(a,c,s,action),
  readAfter:action==='delete'?afterDelete:afterEndpoint,
  verify:(before,after)=>{
   if(action==='delete')return after?.projectId===before.projectId&&after.missing===true;
   if(after?.id!==before.id||after.project_id!==before.projectId||
      after.branch_id!==before.branchId)return false;
   if(action==='start')return ['active','idle'].includes(after.current_state)&&
     (after.current_state!==before.state||after.updated_at!==before.updatedAt);
   if(action==='suspend')return ['idle','suspended'].includes(after.current_state)&&
     (after.current_state!==before.state||after.updated_at!==before.updatedAt);
   return after.updated_at!=null&&after.updated_at!==before.updatedAt;
  }
 });
 return [def,action==='delete'?'Permanently delete compute after disconnect-impact preview.':
   action==='suspend'?'Suspend compute; warn and verify potential dropped production sessions.':
   action==='restart'?'Restart compute after assessing active connection disruption.':
   'Start an inactive compute with verified post-state.',schema()];
}
function validateSettings(a,e){
 const hasTimeout=a.suspendSeconds!==undefined;
 const hasPg=a.pgSettings!==undefined;
 if(!hasTimeout&&!hasPg)throw Error('Choose suspendSeconds or approved pgSettings');
 if(hasTimeout&&(!Number.isSafeInteger(a.suspendSeconds)||
    ![-1,0].includes(a.suspendSeconds)&&
    (a.suspendSeconds<60||a.suspendSeconds>604800)))
  throw Error('Invalid Neon scale-to-zero timeout');
 const settings={};
 if(hasPg){
  if(!a.pgSettings||typeof a.pgSettings!=='object'||Array.isArray(a.pgSettings)||
    !Object.keys(a.pgSettings).length)throw Error('Settings must be a nonempty object');
  const keys=['statement_timeout','lock_timeout','idle_in_transaction_session_timeout'];
  if(Object.entries(a.pgSettings).some(([k,v])=>!keys.includes(k)||
    typeof v!=='string'||!/^\d{1,7}$/.test(v)||Number(v)>3600000))
   throw Error('Only bounded nonnegative timeouts in milliseconds are allowed');
  const current=e.settings?.pg_settings===undefined?{}:e.settings.pg_settings;
  if(e.settings==null||typeof e.settings!=='object'||Array.isArray(e.settings)||
     !current||typeof current!=='object'||Array.isArray(current))
   throw Error('Existing Postgres settings must be independently verified');
  settings.pg_settings={...current,...a.pgSettings};
 }
 return {hasTimeout,hasPg,settings};
}
const setting=defineWrite({name:'neon_compute_update_settings',
 spend:async(_a,c,before)=>{
  // Safe timeout edits cannot add billable CU; only newly always-on computes do.
  if(!before.goingAlwaysOn)return {increaseCents:0,canApply:true};
  const plan=typeof c.db.getVerifiedNeonPlan==='function'
   ?await c.db.getVerifiedNeonPlan(c.connection.neonOrg):await c.planFor?.();
  if(plan?.verified!==true||!['Launch','Scale'].includes(plan.name))return null;
  return createSpendGuard({db:c.db}).price({kind:'compute',plan:plan.name,
   before:{maxCu:before.fromCu},after:{maxCu:before.toCu}});
 },
 plan:async(a,c)=>{
  const {pid,e}=await scope(a,c);
  const v=validateSettings(a,e);
  if(!Number.isFinite(e.autoscaling_limit_max_cu))
   throw Error('Compute spending boundary unavailable');
  if(v.hasTimeout&&a.suspendSeconds===e.suspend_timeout_seconds&&!v.hasPg)
   throw Error('Suspend timeout unchanged');
  const goingAlwaysOn=v.hasTimeout&&a.suspendSeconds===-1&&
   e.suspend_timeout_seconds!==-1;
  return {target:'branch:'+e.branch_id,projectId:pid,branchId:e.branch_id,
   before:{id:e.id,projectId:pid,branchId:e.branch_id,
    goingAlwaysOn,fromCu:goingAlwaysOn?0:e.autoscaling_limit_max_cu,
    toCu:e.autoscaling_limit_max_cu,
    timeout:e.suspend_timeout_seconds,settings:e.settings?.pg_settings??{}},
   summary:'Update verified compute '+e.id+' settings'+
    (v.hasTimeout?'; scale-to-zero timeout '+a.suspendSeconds+' seconds':'')+
    (goingAlwaysOn?'; NEVER SUSPEND can increase compute bills': '')+
    (v.hasPg?'; bounded Postgres timeouts '+Object.keys(a.pgSettings).join(', '):'')+
    '; pricing reservation and confirmed read-back required'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const {pid,e}=await scope(a,c);
  const v=validateSettings(a,e);
  return applyNeonWrite({client:await c.clientFor(pid),
   operationId:'updateProjectEndpoint',projectId:pid,requestKey:key,
   params:{path:{project_id:pid,endpoint_id:e.id},
    body:{endpoint:{...(v.hasTimeout?{suspend_timeout_seconds:a.suspendSeconds}:{}),
     ...(v.hasPg?{settings:v.settings}:{})}}}});
 },
 readAfter:afterEndpoint,
 verify:(before,after,a)=>after?.id===before.id&&
  after.project_id===before.projectId&&after.branch_id===before.branchId&&
  (a.suspendSeconds===undefined||after.suspend_timeout_seconds===a.suspendSeconds)&&
  (a.pgSettings===undefined||Object.entries(a.pgSettings).every(([k,v])=>
   after.settings?.pg_settings?.[k]===v))
});
const definitions=[definition('start'),definition('suspend'),definition('restart'),
 definition('delete'),[setting,'Update scale-to-zero or narrow PostgreSQL timeout settings with cost verification.',
 schema({suspendSeconds:{type:'integer',minimum:-1,maximum:604800},
  pgSettings:{type:'object',additionalProperties:{type:'string'}}})]];
export const tools=definitions.map(([def,description,inputSchema])=>({...def.tool,
 description,inputSchema,profiles:['neon_compute_delete'].includes(def.tool.name)
  ?['full']:['everyday','full'],area:'computes',audience:['owner','operator']}));
export function createComputeLifecycleHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(definitions.map(([def])=>[def.tool.name,
  async(a,c)=>def.handler(a,await contextFor(c))]));
}
export const handlers=createComputeLifecycleHandlers();
