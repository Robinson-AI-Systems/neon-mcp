// D-7 owner-scoped snapshot rename. Rename changes metadata only: expiry and
// retention are never sent or extended, preserving the existing cost boundary.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {manualDevelopmentSnapshot,snapshotInventory,
 sameExistingBranches,sameSnapshotRows} from './snapshot-delete.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const goodName=n=>typeof n==='string'&&/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/.test(n);
async function load(a,c){
 if(!goodName(a.name))throw Error('A safe snapshot name is required');
 const state=await manualDevelopmentSnapshot(a,c);
 if(state.snapshot.name===a.name)throw Error('Snapshot name is unchanged');
 if(state.snapshotNames.some(n=>n===a.name))
  throw Error('Snapshot name already exists in this project');
 return state;
}
const rename=defineWrite({
 name:'neon_snapshot_update',
 plan:async(a,c)=>{
  const before=await load(a,c);
  return {target:'branch:'+before.sourceBranchId,projectId:before.projectId,
   branchId:before.sourceBranchId,before,
   summary:'Rename manual development snapshot '+a.snapshotId+' to '+a.name+
    '. Only its name changes; expiration, retention and storage are preserved.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await load(a,c);
  if(now.projectId!==before.projectId||
    now.sourceBranchId!==before.sourceBranchId||
    JSON.stringify(now.snapshot)!==JSON.stringify(before.snapshot)||
    !sameSnapshotRows(before.snapshots,now.snapshots)||
    !sameExistingBranches(before,now))
   throw Error('Snapshot metadata changed since preview; no rename sent');
  return applyNeonWrite({client:now.client,projectId:before.projectId,
   requestKey,operationId:'updateSnapshot',params:{
    path:{project_id:before.projectId,snapshot_id:a.snapshotId},
    body:{snapshot:{name:a.name}}}});
 },
 readAfter:async(a,c)=>{
  return snapshotInventory(a,c);
 },
 verify:(before,after,a)=>
  after?.projectId===before.projectId&&
  after.sourceBranchId===before.sourceBranchId&&
  sameExistingBranches(before,after)&&
  sameSnapshotRows(before.snapshots.map(s=>s.id===a.snapshotId
   ?{...s,name:a.name}:s),after.snapshots)
});
export const tools=[{...rename.tool,profiles:['full'],area:'snapshots',
 audience:['owner'],description:'Rename a verified manual unprotected-development snapshot without changing expiry or storage; owner-guarded and read back.',
 inputSchema:{type:'object',properties:{projectId:id,snapshotId:id,
  name:{type:'string',minLength:1,maxLength:80},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},required:['snapshotId','name'],
  additionalProperties:false}}];
export function createSnapshotRenameHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_snapshot_update:async(a,c)=>rename.handler(a,await contextFor(c))};
}
export const handlers=createSnapshotRenameHandlers();
