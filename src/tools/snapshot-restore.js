// D-7: restore only to a NEW, unfinalized development review branch.
// Never finalize, replace a branch, or reassign computes in this tool.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {createSpendGuard} from '../neon/spend.js';
import {projectRead} from './project-context.js';
import {manualDevelopmentSnapshot} from './snapshot-delete.js';

const validId=s=>typeof s==='string'&&/^[a-z0-9-]{1,60}$/.test(s);
const validName=s=>typeof s==='string'&&/^[a-z][a-z0-9_-]{2,55}$/.test(s);
async function inventory(a,c){
 const base=await manualDevelopmentSnapshot(a,c);
 const raw=await projectRead(base.client,'listProjectEndpoints',{
  path:{project_id:base.projectId}});
 if(!Array.isArray(raw?.endpoints)||raw.endpoints.length>100||raw.pagination?.cursor)
  throw Error('Compute inventory incomplete');
 const seen=new Set(),endpoints=raw.endpoints.map(e=>{
  if(!validId(e?.id)||e.project_id!==base.projectId||
     !validId(e.branch_id)||seen.has(e.id))
   throw Error('Compute placement unverified');
  seen.add(e.id);
  return {id:e.id,branchId:e.branch_id};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return {...base,endpoints};
}
function eligible(a,b){
 if(!validName(a.name)||b.branchNames.includes(a.name))
  throw Error('New restore branch name is invalid or already in use');
 if(!Number.isSafeInteger(b.snapshot.fullSizeBytes)||
    b.snapshot.fullSizeBytes<0||b.snapshot.fullSizeBytes>100000000000)
  throw Error('Snapshot size unverified for spending estimate');
 if(b.branchIds.length>=32)throw Error('Verified branch inventory capacity reached');
}
const gb=bytes=>Math.ceil(2*bytes/1000000000)+1;
async function spend(a,c,b){
 const plan=await c.planFor?.();
 if(!plan?.verified||!['Launch','Scale'].includes(plan.name))
  throw Error('Authenticated current paid plan unavailable');
 const guard=createSpendGuard({db:c.db});
 const [branch,storage]=await Promise.all([
  guard.price({kind:'branch',plan:plan.name,before:{count:b.branchIds.length},
   after:{count:b.branchIds.length+1}}),
  guard.price({kind:'storage',plan:plan.name,before:{gb:0},
   after:{gb:gb(b.snapshot.fullSizeBytes)}})]);
 if(!branch.canApply||!storage.canApply||!Number.isSafeInteger(
   branch.increaseCents+storage.increaseCents))
  return {increaseCents:null,canApply:false};
 return {increaseCents:branch.increaseCents+storage.increaseCents,
  estimate:true,canApply:true,source:branch.source,
  priceCheckedAt:branch.priceCheckedAt};
}
const restore=defineWrite({
 name:'neon_snapshot_restore',spend,
 plan:async(a,c)=>{
  const before=await inventory(a,c);eligible(a,before);
  return {target:'branch:'+before.sourceBranchId,
   projectId:before.projectId,branchId:before.sourceBranchId,before,
   summary:'Stage snapshot '+a.snapshotId+' as NEW development review branch '+
    a.name+' without finalization. The original branch and compute placements '+
    'must remain unchanged. B-4 reserves conservative one-branch and full-copy '+
    'storage exposure; actual costs may differ. No compute move is permitted.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const current=await inventory(a,c);eligible(a,current);
  if(current.projectId!==before.projectId||
    current.sourceBranchId!==before.sourceBranchId||
    JSON.stringify(current.snapshot)!==JSON.stringify(before.snapshot)||
    JSON.stringify(current.branchIds)!==JSON.stringify(before.branchIds)||
    JSON.stringify(current.branchNames)!==JSON.stringify(before.branchNames)||
    JSON.stringify(current.endpoints)!==JSON.stringify(before.endpoints))
   throw Error('Staged restore target or cost basis changed; no POST');
  const result=await applyNeonWrite({
   client:current.client,operationId:'restoreSnapshot',
   projectId:before.projectId,requestKey,params:{
    path:{project_id:before.projectId,snapshot_id:a.snapshotId},
    body:{name:a.name,finalize_restore:false}}});
  c.restoredBranchId=result?.data?.branch?.id??null;
  if(Array.isArray(result?.data?.endpoints)&&result.data.endpoints.length)
   return {...result,confirmed:'pending'};
  return result;
 },
 readAfter:inventory,
 verify:(b,after,a,c)=>{
  const newId=c.restoredBranchId;
  if(!validId(newId)||b.branchIds.includes(newId)||
     after?.projectId!==b.projectId||
     after.branchIds.length!==b.branchIds.length+1||
     after.sourceBranchId!==b.sourceBranchId||
     JSON.stringify(after.snapshot)!==JSON.stringify(b.snapshot)||
     JSON.stringify(after.snapshotIds)!==JSON.stringify(b.snapshotIds)||
     JSON.stringify(after.endpoints)!==JSON.stringify(b.endpoints))
    return false;
  // The restore may add one branch, but must not silently change existing
  // branch names or protection/default flags. Correlate by ID: provider
  // listing order is not a security property.
  if(!b.branchIds.every((id,i)=>{
   const j=after.branchIds.indexOf(id);
   return j>=0&&after.branchNames[j]===b.branchNames[i]&&
    after.branchDefault[j]===b.branchDefault[i]&&
    after.branchProtected[j]===b.branchProtected[i];
  }))return false;
  const i=after.branchIds.indexOf(newId);
  return i>=0&&after.branchNames[i]===a.name&&
   after.branchProtected[i]===false&&after.branchDefault[i]===false;
 }
});
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
export const tools=[{...restore.tool,profiles:['full'],area:'snapshots',
 audience:['owner'],description:'B-4 priced staging of one verified manual dev snapshot to an unfinalized separate review branch; never moves computes.',
 inputSchema:{type:'object',properties:{projectId:id,snapshotId:id,
  name:{type:'string',pattern:'^[a-z][a-z0-9_-]{2,55}$'},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},required:['snapshotId','name'],
  additionalProperties:false}}];
export function createSnapshotRestoreHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_snapshot_restore:async(a,c)=>restore.handler(a,await contextFor(c))};
}
export const handlers=createSnapshotRestoreHandlers();
