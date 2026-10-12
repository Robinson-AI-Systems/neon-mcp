// D-2 destructive historical restore: preserve the prior branch for every request.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectScope,projectRead} from './project-context.js';

const id=/^[a-z0-9-]{1,60}$/;
const idSchema={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const name=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(v);
const utc=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)
 && Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
const lsn=v=>typeof v==='string'&&/^[0-9a-fA-F]{1,8}\/[0-9a-fA-F]{1,8}$/.test(v);
const common={projectId:idSchema,branchId:idSchema,preserveUnderName:{
 type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,79}$'},
 dryRun:{type:'boolean'},confirm:{type:'boolean'},outsideApp:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}};
const schema=(fields,required)=>({type:'object',
 properties:{...common,...fields},required,additionalProperties:false});
function selected(a,c){
 const pid=projectScope(c,a.projectId??null).projectId;
 if(!pid||!id.test(a.branchId||''))throw Error('Select a scoped target branch');
 return pid;
}
async function state(a,c,kind){
 if(!name(a.preserveUnderName))throw Error('A safe preservation name is mandatory');
 const pid=selected(a,c),client=await c.clientFor(pid);
 const project=await projectRead(client,'getProject',{path:{project_id:pid}});
 if(project?.project?.id!==pid||project.project.org_id!==c.connection.neonOrg)
  throw Error('Project ownership is not independently verified');
 const targetData=await projectRead(client,'getProjectBranch',{
  path:{project_id:pid,branch_id:a.branchId}});
 const target=targetData.branch;
 if(target?.id!==a.branchId||target.project_id!==pid||
    target.current_state!=='ready')
  throw Error('Target branch identity or readiness could not be verified');
 const result=await projectRead(client,'listProjectBranches',{
  path:{project_id:pid},query:{limit:100}});
 const list=result.branches;
 if(!Array.isArray(list)||(result.pagination?.cursor||result.pagination?.next||result.pagination?.next_cursor)||
    list.some(b=>b.project_id!==pid)||
    new Set(list.map(b=>b.id)).size!==list.length||
    list.some(b=>b.name===a.preserveUnderName))
  throw Error('Cannot verify a unique preservation branch name');
 let sourceId;
 if(kind==='reset'){
  sourceId=target.parent_id;
  if(!id.test(sourceId||'')||target.init_source==='schema-only')
   throw Error('A verified parent-data source branch is required');
 } else {
  sourceId=a.sourceBranchId;
  if(!id.test(sourceId||''))throw Error('A source branch ID is required');
  if((a.sourceLsn===undefined)===(a.sourceTimestamp===undefined))
   throw Error('Provide exactly one source LSN or UTC timestamp');
  if(a.sourceLsn!==undefined&&!lsn(a.sourceLsn))
   throw Error('Invalid Postgres LSN');
  if(a.sourceTimestamp!==undefined){
   if(!utc(a.sourceTimestamp))throw Error('Invalid UTC restore timestamp');
   const age=Date.now()-Date.parse(a.sourceTimestamp);
   const retention=project.project.history_retention_seconds;
   if(!Number.isInteger(retention)||retention<0||age<0||
      age>retention*1000)throw Error('Timestamp outside verified restoration history');
  }
 }
 if(sourceId===target.id&&kind==='reset')throw Error('Cannot reset without a separate parent');
 if(list.filter(b=>b.id===target.id).length!==1||
    list.filter(b=>b.id===sourceId).length!==1)
  throw Error('Source and target must exist in the complete project listing');
 return {pid,target,sourceId,priorResetAt:target.last_reset_at??null,
  preserve:a.preserveUnderName};
}
function define(kind){
 return defineWrite({name:kind==='reset'?'neon_branch_reset_from_parent':'neon_branch_restore',
  destructive:true,
  plan:async(a,c)=>{
   const before=await state(a,c,kind);
   return {target:'branch:'+before.target.id,projectId:before.pid,
    branchId:before.target.id,before,
    summary:(kind==='reset'?'RESET from current parent ':'RESTORE from historical source ')+
     before.sourceId+' into '+before.target.id+
     '; preserve all prior branch data under '+before.preserve+
     '; connections and dependent applications may be interrupted'};
  },
  apply:async(a,c,{before,requestKey:key})=>{
   const body={source_branch_id:before.sourceId,preserve_under_name:before.preserve};
   if(kind==='restore'){
    if(a.sourceLsn!==undefined)body.source_lsn=a.sourceLsn;
    else body.source_timestamp=a.sourceTimestamp;
   }
   return applyNeonWrite({client:await c.clientFor(before.pid),
    operationId:'restoreProjectBranch',projectId:before.pid,requestKey:key,
    params:{path:{project_id:before.pid,branch_id:before.target.id},body}});
  },
  readAfter:async(a,c,before)=>{
   const client=await c.clientFor(before.pid);
   const [current,listing]=await Promise.all([
    projectRead(client,'getProjectBranch',{
     path:{project_id:before.pid,branch_id:before.target.id}}),
    projectRead(client,'listProjectBranches',{
     path:{project_id:before.pid},query:{limit:100}})
   ]);
   if(!Array.isArray(listing.branches)||(listing.pagination?.cursor||listing.pagination?.next||listing.pagination?.next_cursor)||
      listing.branches.some(b=>b.project_id!==before.pid))return null;
   return {current:current.branch,saved:listing.branches.filter(b=>
    b.name===before.preserve)};
  },
  verify:(before,after)=>after?.current?.id===before.target.id&&
   after.current.project_id===before.pid&&
   typeof after.current.last_reset_at==='string'&&
   after.current.last_reset_at!==before.priorResetAt&&
   Array.isArray(after.saved)&&after.saved.length===1&&
   after.saved[0].project_id===before.pid&&
   after.saved[0].id!==before.target.id
 });
}
const reset=define('reset'),restore=define('restore');
const entries=[
 [reset,'Reset from current parent; always preserve original data and require guarded confirmation.',
  schema({},['branchId','preserveUnderName'])],
 [restore,'Restore historical LSN or UTC timestamp; always preserve original data.',
  schema({sourceBranchId:idSchema,sourceLsn:{type:'string',minLength:3,maxLength:17},
   sourceTimestamp:{type:'string',format:'date-time'}},
  ['branchId','sourceBranchId','preserveUnderName'])]
];
export const tools=entries.map(([def,description,inputSchema])=>({
 ...def.tool,description,inputSchema,profiles:['full'],area:'branches',
 audience:['owner','operator']}));
export function createBranchRestoreHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(entries.map(([def])=>[def.tool.name,
  async(args,ctx)=>def.handler(args,await contextFor(ctx))]));
}
export const handlers=createBranchRestoreHandlers();
