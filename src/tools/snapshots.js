// D-7: credential-free snapshots and backup schedules, scoped by verified project.
// Reads only: no restore, schedule modification, compute startup or resource mutation.
import {projectScope,projectClient,projectRead} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';

const isId=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const frequencies=new Set(['hourly','daily','weekly','monthly','yearly']);
const number=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export const tools=[defineReadTool('neon_snapshot_list',
 'List bounded project snapshots and independently read branch backup schedules.',{
  projectId:readId,limit:{type:'integer',minimum:1,maximum:100}
 },{area:'snapshots'})];
export function verifiedSnapshots(data){
 const items=data?.snapshots;
 if(!Array.isArray(items)||items.length>100||data.pagination?.cursor)
  throw Error('Complete project snapshot inventory unavailable');
 const seen=new Set();
 return items.map(s=>{
  if(!isId(s?.id)||seen.has(s.id)||typeof s.name!=='string'||
      !s.name||s.name.length>160||typeof s.created_at!=='string'||
      !Number.isFinite(Date.parse(s.created_at))||
      (s.source_branch_id!==undefined&&!isId(s.source_branch_id))||
      (s.full_size!==undefined&&!number(s.full_size,0,Number.MAX_SAFE_INTEGER))||
      (s.diff_size!==undefined&&!number(s.diff_size,0,Number.MAX_SAFE_INTEGER)))
   throw Error('Snapshot identity, size or timestamp unverified');
  seen.add(s.id);
  return {id:s.id,name:s.name,sourceBranchId:s.source_branch_id??null,
   createdAt:s.created_at,expiresAt:s.expires_at??null,manual:s.manual===true,
   fullSizeBytes:s.full_size??null,diffSizeBytes:s.diff_size??null};
 });
}
export function verifiedBranches(data,projectId){
 const items=data?.branches;
 if(!Array.isArray(items)||data.pagination?.cursor||items.length>32)
  throw Error('Complete bounded branch schedule inventory unavailable');
 const seen=new Set();
 return items.map(b=>{
  if(!isId(b?.id)||b.project_id!==projectId||seen.has(b.id)||
      typeof b.default!=='boolean'||typeof b.protected!=='boolean')
   throw Error('Branch schedule identity unverified');
  seen.add(b.id);
  return {id:b.id,name:typeof b.name==='string'?b.name.slice(0,160):null,
   default:b.default===true,protected:b.protected===true};
 });
}
export function verifiedSchedule(data){
 if(!Array.isArray(data?.schedule)||data.schedule.length>20||data.pagination?.cursor)
  throw Error('Backup schedule unavailable or incomplete');
 const seen=new Set();
 return data.schedule.map(s=>{
  if(!frequencies.has(s?.frequency)||
    (s.hour!==undefined&&!number(s.hour,0,23))||
    (s.day!==undefined&&!number(s.day,1,31))||
    (s.month!==undefined&&!number(s.month,1,12))||
    (s.retention_seconds!==undefined&&
      !number(s.retention_seconds,3600,Number.MAX_SAFE_INTEGER)))
   throw Error('Backup schedule field unverified');
  const identity=JSON.stringify([s.frequency,s.hour??null,s.day??null,s.month??null]);
  if(seen.has(identity))throw Error('Duplicate backup schedule entry');
  seen.add(identity);
  return {frequency:s.frequency,hour:s.hour??null,day:s.day??null,
   month:s.month??null,retentionSeconds:s.retention_seconds??null};
 });
}
export function createSnapshotReadHandlers({getClient=projectClient}={}){
 return {async neon_snapshot_list(args,ctx){
  const scope=projectScope(ctx,args.projectId??null);
  if(!scope.projectId)throw Error('Choose an authorized project for snapshots');
  const {client}=await getClient(ctx,scope.projectId);
  const path={project_id:scope.projectId};
  const project=await projectRead(client,'getProject',{path});
  if(project?.project?.id!==scope.projectId||
      project.project.org_id!==scope.org)
   throw Error('Snapshot project identity unverified');
  const snapshots=verifiedSnapshots(await projectRead(client,'listSnapshots',{path}));
  const branches=verifiedBranches(await projectRead(client,'listProjectBranches',{
   path,query:{limit:100}}),scope.projectId);
  const schedules=[];
  for(const b of branches){
   const schedule=verifiedSchedule(await projectRead(client,'getSnapshotSchedule',{
    path:{...path,branch_id:b.id}}));
   schedules.push({...b,schedule});
  }
  const limit=args.limit??50;
  if(!number(limit,1,100))throw Error('Invalid snapshot limit');
  return readText({projectId:scope.projectId,
   snapshots:snapshots.slice(0,limit),total:snapshots.length,
   capped:snapshots.length>limit,branchSchedules:schedules,
   note:'Snapshot storage can incur charges; this request only reads metadata.'});
 }};
}
export const handlers=createSnapshotReadHandlers();
