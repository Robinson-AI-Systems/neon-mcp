// D-7: destructive deletion is limited to verified manual snapshots of active,
// unprotected, non-default development branches; no database connection is opened.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectScope,projectRead} from './project-context.js';
import {verifiedSnapshots,verifiedBranches} from './snapshots.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const validId=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
async function inventory(args,ctx){
 const pid=projectScope(ctx,args.projectId??null).projectId;
 if(!pid||!validId(args.snapshotId)||ctx.connection.profile!=='full')
  throw Error('Owner and exact snapshot identity required');
 const client=await ctx.clientFor(pid),path={project_id:pid};
 const p=(await projectRead(client,'getProject',{path}))?.project;
 if(p?.id!==pid||p.org_id!==ctx.connection.neonOrg)
  throw Error('Snapshot project ownership unverified');
 const snaps=verifiedSnapshots(await projectRead(client,'listSnapshots',{path}));
 const branches=verifiedBranches(await projectRead(client,'listProjectBranches',{
  path,query:{limit:100}}),pid);
 if(branches.some(b=>!b.name))throw Error('Complete branch names are required');
 const snapshot=snaps.find(s=>s.id===args.snapshotId)??null;
 // The source must still exist. No deletion of legacy, scheduled, protected
 // or default-branch backups, and no deletion if provider flags are missing.
 const source=snapshot?.sourceBranchId;
 if(source&&!branches.some(b=>b.id===source))
  throw Error('Snapshot source is no longer an active verified branch');
 if(source){
  const item=(await projectRead(client,'getProjectBranch',{
   path:{...path,branch_id:source}}))?.branch;
  const listed=branches.find(b=>b.id===source);
  if(item?.id!==source||item.project_id!==pid||
      typeof item.default!=='boolean'||typeof item.protected!=='boolean'||
      typeof listed.default!=='boolean'||typeof listed.protected!=='boolean'||
      item.default||item.protected||listed.default||listed.protected)
   throw Error('Snapshot source is protected or its status is unverified');
 }
 return {projectId:pid,snapshot,sourceBranchId:source??null,
  snapshots:snaps,branchRows:branches,
  snapshotIds:snaps.map(s=>s.id),snapshotNames:snaps.map(s=>s.name),
  branchIds:branches.map(b=>b.id),branchNames:branches.map(b=>b.name),
  branchDefault:branches.map(b=>b.default),branchProtected:branches.map(b=>b.protected),client};
}
// Validate identities independently of response ordering. Deletion and rename
// may remove/rename only the targeted snapshot, never mutate existing branches.
export function sameExistingBranches(before,after){
 if(!Array.isArray(after?.branchRows)||after.branchRows.length!==before.branchRows.length)
  return false;
 const byId=new Map(after.branchRows.map(b=>[b.id,b]));
 return byId.size===before.branchRows.length&&before.branchRows.every(b=>
  JSON.stringify(byId.get(b.id))===JSON.stringify(b));
}
export function sameSnapshotRows(expected,actual){
 if(!Array.isArray(actual)||actual.length!==expected.length)return false;
 const byId=new Map(actual.map(s=>[s.id,s]));
 return byId.size===expected.length&&expected.every(s=>
  JSON.stringify(byId.get(s.id))===JSON.stringify(s));
}
async function target(args,ctx){
 const data=await inventory(args,ctx);
 if(!data.snapshot||data.snapshot.manual!==true||!data.sourceBranchId)
  throw Error('Only existing manually created development snapshots can be deleted');
 return data;
}
const deletion=defineWrite({
 name:'neon_snapshot_delete',destructive:true,
 plan:async(a,c)=>{
  const before=await target(a,c);
  return {target:'branch:'+before.sourceBranchId,
   projectId:before.projectId,branchId:before.sourceBranchId,before,
   summary:'Permanently delete manual snapshot '+a.snapshotId+
    ' on unprotected development branch '+before.sourceBranchId+
    '. This removes a recovery point and cannot be undone.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const current=await target(a,c);
  if(current.projectId!==before.projectId||
     current.sourceBranchId!==before.sourceBranchId||
     JSON.stringify(current.snapshot)!==JSON.stringify(before.snapshot)||
     !sameSnapshotRows(before.snapshots,current.snapshots)||
     !sameExistingBranches(before,current))
   throw Error('Snapshot inventory changed since preview; do not delete');
  return applyNeonWrite({client:current.client,operationId:'deleteSnapshot',
   params:{path:{project_id:before.projectId,snapshot_id:a.snapshotId}},
   projectId:before.projectId,requestKey});
 },
 readAfter:async(a,c)=>inventory(a,c),
 verify:(before,after,a)=>
  after?.projectId===before.projectId&&
  after?.snapshot===null&&
  after.sourceBranchId===null&&
  sameExistingBranches(before,after)&&
  sameSnapshotRows(before.snapshots.filter(s=>s.id!==a.snapshotId),after.snapshots)
});
export const tools=[{...deletion.tool,profiles:['full'],area:'snapshots',
 audience:['owner'],description:'Owner-only permanent deletion of a verified manual development snapshot, with independent stale-state refusal and readback.',
 inputSchema:{type:'object',properties:{projectId:id,snapshotId:id,
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},required:['snapshotId'],
  additionalProperties:false}}];
export function createSnapshotDeleteHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_snapshot_delete:async(a,c)=>
  deletion.handler(a,await contextFor(c))};
}
export const handlers=createSnapshotDeleteHandlers();

// Reuse the same strict project/source verification for non-costed rename.
export const snapshotInventory=inventory;
export const manualDevelopmentSnapshot=target;
