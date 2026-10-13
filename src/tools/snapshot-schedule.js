// D-7: only shorten a finite, already configured automatic-snapshot
// retention. A cadence addition/extension needs separately priced B-4 approval.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectRead,projectScope} from './project-context.js';
import {verifiedBranches,verifiedSchedule} from './snapshots.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const validId=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const fields=['hour','day','month'];
// Provider ordering is not identity. These verified inventories are bounded
// and unique; compare complete original rows by their stable identity keys.
function sameRows(before,after,key){
 if(!Array.isArray(before)||!Array.isArray(after)||before.length!==after.length)
  return false;
 const map=new Map(after.map(row=>[key(row),row]));
 return map.size===before.length&&before.every(row=>
  JSON.stringify(map.get(key(row)))===JSON.stringify(row));
}
const sameBranches=(a,b)=>sameRows(a,b,row=>row.id);
const cadenceKey=row=>JSON.stringify([row.frequency,row.hour,row.day,row.month]);
const sameSchedule=(a,b)=>sameRows(a,b,cadenceKey);
function selects(s,a){
 return s.frequency===a.frequency&&
  fields.every(k=>s[k]===(a[k]??null));
}
function reduced(a,state){
 if(!['hourly','daily','weekly','monthly','yearly'].includes(a.frequency)||
    !['shorten_retention','remove_cadence'].includes(a.action??'shorten_retention'))
  throw Error('Choose a valid existing frequency and schedule action');
 for(const [k,min,max] of [['hour',0,23],['day',1,31],['month',1,12]]){
  if(a[k]!==undefined&&(!Number.isSafeInteger(a[k])||a[k]<min||a[k]>max))
   throw Error('Invalid schedule time selector');
 }
 const matches=state.schedule.filter(s=>selects(s,a));
 if(matches.length!==1)
  throw Error('Exactly one existing schedule entry must match the chosen time');
 if(a.action==='remove_cadence'){
  if(a.retentionSeconds!==undefined||state.schedule.length<2)
   throw Error('Removal cannot specify retention or remove the last backup cadence');
  const remaining=state.schedule.filter(s=>!selects(s,a));
  // Never leave a development branch with only monthly/weekly backups or a
  // daily/hourly schedule retaining less than one full day of recovery.
  if(!remaining.some(s=>['hourly','daily'].includes(s.frequency)&&
      s.retentionSeconds>=86400))
   throw Error('Removal must preserve daily-or-better scheduled recovery');
  return remaining;
 }
 if(!Number.isSafeInteger(a.retentionSeconds)||a.retentionSeconds<3600||
    !Number.isSafeInteger(matches[0].retentionSeconds)||
    a.retentionSeconds>=matches[0].retentionSeconds)
  throw Error('Retention must strictly shorten an existing finite value');
 return state.schedule.map(s=>selects(s,a)?
  {...s,retentionSeconds:a.retentionSeconds}:s);
}
function payload(schedule){
 return schedule.map(s=>{
  const item={frequency:s.frequency};
  for(const k of fields)if(s[k]!==null)item[k]=s[k];
  item.retention_seconds=s.retentionSeconds;
  return item;
 });
}
async function inventory(a,c){
 const projectId=projectScope(c,a.projectId??null).projectId;
 if(c.connection.profile!=='full'||!projectId||!validId(a.branchId))
  throw Error('Verified owner and exact branch identity required');
 const client=await c.clientFor(projectId),path={project_id:projectId};
 const p=(await projectRead(client,'getProject',{path}))?.project;
 if(p?.id!==projectId||p.org_id!==c.connection.neonOrg)
  throw Error('Schedule project ownership unverified');
 const branches=verifiedBranches(await projectRead(client,'listProjectBranches',{
  path,query:{limit:100}}),projectId);
 const listed=branches.find(b=>b.id===a.branchId);
 if(branches.some(b=>!b.name))
  throw Error('Complete named branch inventory required for schedule replacement');
 const branch=(await projectRead(client,'getProjectBranch',{
  path:{...path,branch_id:a.branchId}}))?.branch;
 if(!listed||listed.default||listed.protected||
    branch?.id!==a.branchId||branch.project_id!==projectId||
    branch.name!==listed.name||
    branch.default!==false||branch.protected!==false)
  throw Error('Only verified non-default unprotected development branches are eligible');
 const response=await projectRead(client,'getSnapshotSchedule',{
  path:{...path,branch_id:a.branchId}});
 // A PUT is a complete replacement: reject provider fields that this pinned
 // schema cannot round-trip, not silently erase future schedule configuration.
 if(!Array.isArray(response?.schedule)||response.pagination?.cursor||
    response.schedule.some(s=>!s||typeof s!=='object'||Array.isArray(s)||
      Object.keys(s).some(k=>!['frequency','hour','day','month','retention_seconds'].includes(k))))
  throw Error('Cannot safely replace incomplete or extended backup schedule');
 const schedule=verifiedSchedule(response);
 if(!schedule.length||schedule.some(s=>!Number.isSafeInteger(s.retentionSeconds)))
  throw Error('Finite existing retention required on every entry');
 return {projectId,branchId:a.branchId,branches,schedule,client};
}
const write=defineWrite({
 name:'neon_snapshot_set_schedule',destructive:true,
 plan:async(a,c)=>{
  const before=await inventory(a,c);
  reduced(a,before);
  return {target:'branch:'+before.branchId,projectId:before.projectId,
   branchId:before.branchId,before,
   summary:(a.action==='remove_cadence'?
    'Remove an existing redundant '+a.frequency+' backup cadence from development branch '+
     before.branchId+'. A daily-or-better finite recovery cadence stays configured.':
    'Shorten existing '+a.frequency+' snapshot retention on unprotected development branch '+
     before.branchId+' to '+a.retentionSeconds+' seconds.')+
    ' No cadence is added or extended. Older recovery points may expire sooner; '+
    'confirm loss of recovery coverage.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const current=await inventory(a,c);
  if(current.projectId!==before.projectId||current.branchId!==before.branchId||
    !sameBranches(current.branches,before.branches)||
    !sameSchedule(current.schedule,before.schedule))
   throw Error('Backup schedule or branch protection changed since preview');
  const schedule=reduced(a,current);
  return applyNeonWrite({client:current.client,operationId:'setSnapshotSchedule',
   projectId:before.projectId,requestKey,params:{
    path:{project_id:before.projectId,branch_id:before.branchId},
    body:{schedule:payload(schedule)}}});
 },
 readAfter:inventory,
 verify:(before,after,a)=>after?.projectId===before.projectId&&
  after.branchId===before.branchId&&
  sameBranches(after.branches,before.branches)&&
  sameSchedule(after.schedule,reduced(a,before))
});
export const tools=[{...write.tool,profiles:['full'],area:'snapshots',
 audience:['owner'],description:'Owner-confirmed reduction of development snapshot retention or redundant cadence without loss of daily recovery; exact readback.',
 inputSchema:{type:'object',properties:{projectId:id,branchId:id,
  frequency:{type:'string',enum:['hourly','daily','weekly','monthly','yearly']},
  action:{type:'string',enum:['shorten_retention','remove_cadence']},
  hour:{type:'integer',minimum:0,maximum:23},
  day:{type:'integer',minimum:1,maximum:31},
  month:{type:'integer',minimum:1,maximum:12},
  retentionSeconds:{type:'integer',minimum:3600},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},required:['branchId','frequency'],
  additionalProperties:false}}];
export function createSnapshotScheduleHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_snapshot_set_schedule:async(a,c)=>
  write.handler(a,await contextFor(c))};
}
export const handlers=createSnapshotScheduleHandlers();
