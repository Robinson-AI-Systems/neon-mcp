// D-1e: audited project configuration, history retention and consumption quota mutations.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {createSpendGuard} from '../neon/spend.js';
import {projectRead,projectScope} from './project-context.js';
const projectId=(a,c)=>{
 const pid=projectScope(c,a.projectId??null).projectId;
 if(!pid)throw Error('Select a project');return pid;
};
const load=async(a,c)=>{
 const pid=projectId(a,c);
 const data=await projectRead(await c.clientFor(pid),'getProject',{path:{project_id:pid}});
 if(data?.project?.id!==pid||data.project.org_id!==c.connection.neonOrg)
  throw Error('Project identity mismatch');
 return data.project;
};
const run=async(a,c,body,key)=>applyNeonWrite({
 client:await c.clientFor(projectId(a,c)),operationId:'updateProject',
 params:{path:{project_id:projectId(a,c)},body:{project:body}},
 projectId:projectId(a,c),requestKey:key});
const time=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const library=s=>typeof s==='string'&&/^[a-z][a-z0-9_]{0,59}$/.test(s);
const safeDays=v=>Array.isArray(v)&&v.length>=1&&v.length<=7&&
 new Set(v).size===v.length&&v.every(x=>Number.isInteger(x)&&x>=1&&x<=7);
const validLimit=n=>Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
const validCu=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0.25&&n<=16;
const fields=['active_time_seconds','compute_time_seconds','written_data_bytes',
 'data_transfer_bytes','logical_size_bytes'];
const validQuota=q=>!!q&&typeof q==='object'&&!Array.isArray(q)&&
 Object.keys(q).length>0&&Object.keys(q).every(k=>fields.includes(k)&&validLimit(q[k]));
const zero={increaseCents:0,estimate:false,canApply:true};
const quote=async(c,kind,before,after)=>{
 if(typeof c.db.getVerifiedNeonPlan!=='function')return null;
 const current=await c.db.getVerifiedNeonPlan(c.connection.neonOrg);
 if(current?.verified!==true||!['Launch','Scale'].includes(current.name))
  return null;
 return createSpendGuard({db:c.db}).price({kind,plan:current.name,before,after});
};
const settings=defineWrite({name:'neon_project_update_settings',projectWide:true,
 spend:async(a,c,before)=>{
  if(a.maxCu===undefined&&a.minCu===undefined&&a.suspendSeconds===undefined)
   return zero;
  const known=before.default_endpoint_settings;
  if(!known||!validCu(known.autoscaling_limit_max_cu))
   return null;
  // Conservative maximum extra monthly charge: price the whole new maximum for 730h.
  return quote(c,'compute',{maxCu:0},{maxCu:a.maxCu??known.autoscaling_limit_max_cu});
 },
 plan:async(a,c)=>{
  const before=await load(a,c);
  const changed=['maintenanceWindow','enabledLibraries','minCu','maxCu','suspendSeconds']
   .some(k=>a[k]!==undefined);
  if(!changed)throw Error('No setting selected');
  if(a.maintenanceWindow!==undefined){
   const m=a.maintenanceWindow;
   if(!m||!safeDays(m.weekdays)||!time(m.startTime)||!time(m.endTime)||
      m.startTime===m.endTime)throw Error('Invalid UTC maintenance window');
  }
  if(a.enabledLibraries!==undefined&&(!Array.isArray(a.enabledLibraries)||
    a.enabledLibraries.length>30||new Set(a.enabledLibraries).size!==a.enabledLibraries.length||
    !a.enabledLibraries.every(library)))throw Error('Invalid preload library names');
  if(a.maxCu!==undefined&&!validCu(a.maxCu))throw Error('Invalid maximum CU');
  if(a.minCu!==undefined&&!validCu(a.minCu))throw Error('Invalid minimum CU');
  const old=before.default_endpoint_settings||{};
  const min=a.minCu??old.autoscaling_limit_min_cu;
  const max=a.maxCu??old.autoscaling_limit_max_cu;
  if((a.maxCu!==undefined||a.minCu!==undefined)&&
      (!validCu(min)||!validCu(max)||min>max))throw Error('CU min/max must be verified');
  // Never silently disable autosuspend or lengthen idle billing time.
  if(a.suspendSeconds!==undefined&&(!Number.isInteger(a.suspendSeconds)||
    a.suspendSeconds<60||a.suspendSeconds>604800||
    !Number.isInteger(old.suspend_timeout_seconds)||
    a.suspendSeconds>old.suspend_timeout_seconds))
   throw Error('Only tighter auto-suspend is allowed here');
  return {target:'project:'+before.id,projectId:before.id,before,
   summary:'Modify default project compute/maintenance/preload settings on '+before.id+
    '; maintenance or preload changes can interrupt active connections'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const project={};
  const settingsData={};
  if(a.maintenanceWindow)settingsData.maintenance_window={
   weekdays:a.maintenanceWindow.weekdays,start_time:a.maintenanceWindow.startTime,
   end_time:a.maintenanceWindow.endTime};
  if(a.enabledLibraries)settingsData.preload_libraries={
   use_defaults:false,enabled_libraries:a.enabledLibraries};
  if(Object.keys(settingsData).length)project.settings=settingsData;
  const defaults={};
  if(a.minCu!==undefined)defaults.autoscaling_limit_min_cu=a.minCu;
  if(a.maxCu!==undefined)defaults.autoscaling_limit_max_cu=a.maxCu;
  if(a.suspendSeconds!==undefined)defaults.suspend_timeout_seconds=a.suspendSeconds;
  if(Object.keys(defaults).length)project.default_endpoint_settings=defaults;
  return run(a,c,project,key);
 },
 readAfter:load,
 verify:(before,after,a)=>{
  if(after?.id!==before.id)return false;
  const s=after.settings||{},d=after.default_endpoint_settings||{};
  if(a.maintenanceWindow&&JSON.stringify(s.maintenance_window?.weekdays)!==
       JSON.stringify(a.maintenanceWindow.weekdays))return false;
  if(a.maintenanceWindow&&(s.maintenance_window?.start_time!==a.maintenanceWindow.startTime||
    s.maintenance_window?.end_time!==a.maintenanceWindow.endTime))return false;
  if(a.enabledLibraries&&JSON.stringify(s.preload_libraries?.enabled_libraries)!==
     JSON.stringify(a.enabledLibraries))return false;
  if(a.minCu!==undefined&&d.autoscaling_limit_min_cu!==a.minCu)return false;
  if(a.maxCu!==undefined&&d.autoscaling_limit_max_cu!==a.maxCu)return false;
  if(a.suspendSeconds!==undefined&&d.suspend_timeout_seconds!==a.suspendSeconds)return false;
  return true;
 }
});
const retention=defineWrite({name:'neon_project_set_history_retention',projectWide:true,
 spend:async(a,c,before)=>{
  if(a.seconds<=before.history_retention_seconds)return zero;
  // A growing history bill cannot be estimated from lagged bytes-hour usage.
  // Require independently verified before/after history storage forecasts.
  if(typeof c.db.getVerifiedHistoryStorageForecast!=='function')return null;
  const f=await c.db.getVerifiedHistoryStorageForecast({
   orgId:c.connection.neonOrg,projectId:before.id,
   beforeSeconds:before.history_retention_seconds,afterSeconds:a.seconds});
  if(f?.verified!==true||![f.beforeGb,f.afterGb].every(
   n=>typeof n==='number'&&Number.isFinite(n)&&n>=0))return null;
  return quote(c,'restore',{gb:f.beforeGb},{gb:f.afterGb});
 },
 plan:async(a,c)=>{
  const before=await load(a,c);
  if(!Number.isInteger(a.seconds)||a.seconds<0||a.seconds>2592000||
    a.seconds===before.history_retention_seconds)
   throw Error('Invalid or unchanged history retention');
  return {target:'project:'+before.id,projectId:before.id,before,
   summary:(a.seconds<before.history_retention_seconds
    ?'Shorten restoration history; older restore points may be permanently lost on '
    :'Increase billable instant-restore history on ')+before.id+
    ' from '+before.history_retention_seconds+'s to '+a.seconds+'s'};
 },
 apply:(a,c,{requestKey:key})=>run(a,c,{history_retention_seconds:a.seconds},key),
 readAfter:load,
 verify:(before,after,a)=>after?.id===before.id&&
  after.history_retention_seconds===a.seconds
});
const quotas=defineWrite({name:'neon_project_set_quotas',projectWide:true,
 plan:async(a,c)=>{
  const before=await load(a,c);
  if(!validQuota(a.quota))throw Error('Invalid quota fields');
  const prior=before.settings?.quota||{};
  let tighter=false;
  for(const [key,value] of Object.entries(a.quota)){
   const previous=prior[key]??0;
   // Zero means unlimited: never relax or disable consumption protections.
   if(value===previous)continue;
   if(value===0||(previous!==0&&value>=previous))
    throw Error('Quota can only be tightened');
   tighter=true;
  }
  if(!tighter)throw Error('No tighter quota supplied');
  const exhausted=Object.entries(a.quota).filter(([field,limit])=>
   Number.isFinite(before[field])&&before[field]>=limit).map(([k])=>k);
  return {target:'project:'+before.id,projectId:before.id,before,
   summary:'Tighten quotas for '+before.id+
    '; reaching a quota suspends computes or blocks branch writes'+
    (exhausted.length?' (already exceeded: '+exhausted.join(', ')+')':'')};
 },
 apply:async(a,c,{before,requestKey:key})=>{
  const allowed=Object.fromEntries(fields.filter(k=>validLimit(before.settings?.quota?.[k]))
   .map(k=>[k,before.settings.quota[k]]));
  return run(a,c,{settings:{quota:{...allowed,...a.quota}}},key);
 },
 readAfter:load,
 verify:(before,after,a)=>after?.id===before.id&&
  Object.entries(a.quota).every(([k,v])=>after.settings?.quota?.[k]===v)
});
const flag={dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128},outsideApp:{type:'boolean'},
 projectId:{type:'string',pattern:'^[a-z0-9-]{1,60}$'}};
const schema=(extra,required=[])=>({type:'object',
 properties:{...flag,...extra},required,additionalProperties:false});
const toolsByDefinition=[
 [settings,'Update guarded default compute, UTC maintenance window and preload libraries.',
  schema({
   maintenanceWindow:{type:'object',properties:{
    weekdays:{type:'array',items:{type:'integer',minimum:1,maximum:7},minItems:1,maxItems:7},
    startTime:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},
    endTime:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'}},
    required:['weekdays','startTime','endTime'],additionalProperties:false},
   enabledLibraries:{type:'array',items:{type:'string',pattern:'^[a-z][a-z0-9_]{0,59}$'},
    maxItems:30},minCu:{type:'number',minimum:0.25,maximum:16},
   maxCu:{type:'number',minimum:0.25,maximum:16},
   suspendSeconds:{type:'integer',minimum:60,maximum:604800}})],
 [retention,'Preview and change restore history within 30 days with independently verified costs.',
  schema({seconds:{type:'integer',minimum:0,maximum:2592000}},['seconds'])],
 [quotas,'Tighten verified project consumption quotas with compute-suspension warning.',
  schema({quota:{type:'object',properties:Object.fromEntries(fields.map(k=>
    [k,{type:'integer',minimum:0}])),additionalProperties:false}},['quota'])]
];
export const tools=toolsByDefinition.map(([def,description,inputSchema])=>({
 ...def.tool,profiles:['full'],area:'projects',audience:['owner','operator'],
 description,inputSchema}));
export function createProjectSettingsHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(toolsByDefinition.map(([def])=>[def.tool.name,async(args,ctx)=>
  def.handler(args,await contextFor(ctx))]));
}
export const handlers=createProjectSettingsHandlers();
