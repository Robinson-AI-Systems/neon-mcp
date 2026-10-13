// D-7 guarded manual snapshot creation. A full snapshot can incur storage
// charges: require a source-dated B-4 admission before any POST.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {createSpendGuard} from '../neon/spend.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectScope,projectRead} from './project-context.js';
import {verifiedSnapshots,verifiedBranches} from './snapshots.js';
import {sameExistingBranches,sameSnapshotRows} from './snapshot-delete.js';

const id=/^[a-z0-9-]{1,60}$/;
const validName=n=>typeof n==='string'&&/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/.test(n);
const utc=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s)&&
 Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().replace('.000Z','Z')===s;
function dates(a){
 const now=Date.now(),at=Date.parse(a.expiresAt);
 if(!utc(a.expiresAt)||at<now+3600000||at>now+7*86400000)
  throw Error('A UTC expiration between one hour and seven days is required');
}
async function inventory(a,c){
 const projectId=projectScope(c,a.projectId??null).projectId;
 if(c.connection.profile!=='full'||!projectId||!id.test(a.branchId||''))
  throw Error('An owner and verified branch are required');
 const client=await c.clientFor(projectId),path={project_id:projectId};
 const project=(await projectRead(client,'getProject',{path}))?.project;
 if(project?.id!==projectId||project.org_id!==c.connection.neonOrg)
  throw Error('Project ownership unverified');
 const branches=verifiedBranches(await projectRead(client,'listProjectBranches',{
  path,query:{limit:100}}),projectId);
 const listed=branches.find(b=>b.id===a.branchId);
 if(!listed||listed.protected||listed.default||!listed.name||
    branches.some(b=>!b.name))
  throw Error('Only fully verified unprotected development branches are eligible');
 const branch=(await projectRead(client,'getProjectBranch',{
  path:{...path,branch_id:a.branchId}}))?.branch;
 if(branch?.id!==a.branchId||branch.project_id!==projectId||
    branch.name!==listed.name||
    branch.protected!==false||branch.default!==false||
    !Number.isSafeInteger(branch.logical_size)||branch.logical_size<0||
    branch.logical_size>100000000000)
  throw Error('Current development branch size or protection is unverified');
 const snapshots=verifiedSnapshots(await projectRead(client,'listSnapshots',{path}));
 return {projectId,branchId:a.branchId,bytes:branch.logical_size,
  branchRows:branches,snapshots,client};
}
function eligible(a,state){
 if(!validName(a.name))throw Error('Choose a safe snapshot name');
 dates(a);
 if(state.snapshots.some(s=>s.name===a.name))
  throw Error('A snapshot with this name already exists');
 if(state.snapshots.filter(s=>s.manual===true).length>=100)
  throw Error('Manual snapshot entitlement or limit requires provider review');
}
// Estimate 2x observed full logical bytes plus 1 GB buffer and charge for a
// whole month even though requested retention is <=7 days. This is a bounded,
// source-dated conservative forecast, NOT a provider storage guarantee.
const forecastGb=bytes=>Math.ceil(bytes*2/1000000000)+1;
async function spend(a,c,before){
 const plan=await c.planFor?.();
 if(!plan?.verified||!['Launch','Scale'].includes(plan.name))
  throw Error('Current paid organization plan cannot be verified');
 return createSpendGuard({db:c.db}).price({kind:'snapshot',plan:plan.name,
  before:{gb:0},after:{gb:forecastGb(before.bytes)}});
}
const create=defineWrite({
 name:'neon_snapshot_create',spend,
 plan:async(a,c)=>{
  const before=await inventory(a,c);eligible(a,before);
  return {target:'branch:'+before.branchId,projectId:before.projectId,
   branchId:before.branchId,before,
   summary:'Create manual snapshot '+a.name+' of verified development branch '+
    before.branchId+' expiring '+a.expiresAt+'. A full snapshot is billable at '+
    '$0.09 per GB-month; reserved projection covers twice observed logical size '+
    'plus 1 GB. Actual storage can differ with concurrent writes. Confirm spending.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const current=await inventory(a,c);eligible(a,current);
  if(current.bytes!==before.bytes||current.projectId!==before.projectId||
     current.branchId!==before.branchId||
     !sameExistingBranches(before,current)||
     !sameSnapshotRows(before.snapshots,current.snapshots))
   throw Error('Snapshot/branch inventory or price basis drifted since preview');
  const result=await applyNeonWrite({client:current.client,
   operationId:'createSnapshot',projectId:before.projectId,requestKey,
   params:{path:{project_id:before.projectId,branch_id:before.branchId},
    query:{name:a.name,expires_at:a.expiresAt}}});
  c.newSnapshotId=result?.data?.snapshot?.id??null;
  return result;
 },
 readAfter:inventory,
 verify:(before,after,a,c)=>{
  if(after?.projectId!==before.projectId||
    after.branchId!==before.branchId||
    !sameExistingBranches(before,after)||
    after.snapshots.length!==before.snapshots.length+1||
    !id.test(c.newSnapshotId||''))return false;
  const prior=new Map(before.snapshots.map(s=>[s.id,JSON.stringify(s)]));
  for(const s of after.snapshots){
   if(prior.has(s.id)){
    if(prior.get(s.id)!==JSON.stringify(s))return false;
   }else if(s.id!==c.newSnapshotId||s.name!==a.name||
     s.sourceBranchId!==before.branchId||s.manual!==true||
     s.expiresAt!==a.expiresAt)return false;
  }
  return after.snapshots.filter(s=>s.id===c.newSnapshotId).length===1;
 }
});
const strId={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
export const tools=[{...create.tool,profiles:['full'],area:'snapshots',
 audience:['owner'],description:'Create a time-limited manual dev snapshot with independently verified size, source-dated storage forecast and B-4 spend reservation.',
 inputSchema:{type:'object',properties:{projectId:strId,branchId:strId,
  name:{type:'string',minLength:1,maxLength:80},
  expiresAt:{type:'string',format:'date-time'},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},required:['branchId','name','expiresAt'],
 additionalProperties:false}}];
export function createSnapshotCreateHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_snapshot_create:async(a,c)=>create.handler(a,await contextFor(c))};
}
export const handlers=createSnapshotCreateHandlers();
