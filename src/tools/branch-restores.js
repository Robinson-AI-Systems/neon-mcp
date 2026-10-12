// D-2: reset and historical restore are audited destructive writes that ALWAYS
// preserve the prior branch state, including on development targets.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {createSpendGuard} from '../neon/spend.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectScope,projectRead} from './project-context.js';

const idPattern=/^[a-z0-9-]{1,60}$/;
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const safeName=n=>typeof n==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{2,99}$/.test(n);
const path=(projectId,branchId)=>({project_id:projectId,branch_id:branchId});
const flags={projectId:id,branchId:id,dryRun:{type:'boolean'},confirm:{type:'boolean'},
 outsideApp:{type:'boolean'},requestKey:{type:'string',minLength:8,maxLength:128},
 preserveName:{type:'string',minLength:3,maxLength:100,pattern:'^[a-zA-Z][a-zA-Z0-9_-]{2,99}$'}};
const schema=(fields,required=[])=>({type:'object',
 properties:{...flags,...fields},required,additionalProperties:false});
function nameFor(target){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date()).map(x=>[x.type,x.value]));
 const name=String(target.name||'branch').replace(/[^a-zA-Z0-9_-]/g,'-')
  .replace(/^[^a-zA-Z]+/,'b-').slice(0,60);
 return name+'-before-'+parts.year+parts.month+parts.day+'-'+
  parts.hour+parts.minute+parts.second;
}
function targetIds(args,ctx){
 const projectId=projectScope(ctx,args.projectId??null).projectId;
 if(!projectId||!idPattern.test(args.branchId||''))throw Error('Scoped project and branch required');
 return {projectId,branchId:args.branchId};
}
async function dataFor(args,ctx){
 const {projectId,branchId}=targetIds(args,ctx);
 const client=await ctx.clientFor(projectId);
 const info=await projectRead(client,'getProject',{path:{project_id:projectId}});
 if(info?.project?.id!==projectId||info.project.org_id!==ctx.connection.neonOrg)
  throw Error('Project identity cannot be verified');
 const branch=await projectRead(client,'getProjectBranch',{path:path(projectId,branchId)});
 if(branch?.branch?.id!==branchId||branch.branch.project_id!==projectId)
  throw Error('Branch identity cannot be verified');
 const page=await projectRead(client,'listProjectBranches',{
  path:{project_id:projectId},query:{limit:100}});
 const list=page?.branches;
 if(!Array.isArray(list)||page.pagination?.next||page.pagination?.cursor||
    new Set(list.map(x=>x.id)).size!==list.length||
    list.some(x=>x.project_id!==projectId)||
    !list.some(x=>x.id===branchId))
  throw Error('Complete branch inventory unavailable');
 return {client,projectId,target:branch.branch,list};
}
async function preview(args,ctx,kind){
 const state=await dataFor(args,ctx),t=state.target;
 if(!safeName(args.preserveName)&&args.preserveName!==undefined)
  throw Error('Invalid preservation branch name');
 const preserveName=args.preserveName??nameFor(t);
 if(!safeName(preserveName)||state.list.some(x=>x.name===preserveName))
  throw Error('A unique safe preservation name is required');
 const sourceId=kind==='reset'?t.parent_id:args.sourceBranchId;
 if(!idPattern.test(sourceId||'')||!state.list.some(x=>x.id===sourceId))
  throw Error('Restore source must be an active verified branch');
 if(kind==='restore'){
  if(args.sourceLsn!==undefined&&args.sourceTimestamp!==undefined)
   throw Error('Choose only one restore time');
  if(sourceId===t.id&&args.sourceLsn===undefined&&args.sourceTimestamp===undefined)
   throw Error('Self-restore requires a timestamp or LSN');
  if(args.sourceLsn!==undefined&&
     (typeof args.sourceLsn!=='string'||!/^[0-9a-f]+\/[0-9a-f]+$/i.test(args.sourceLsn)))
   throw Error('Invalid Postgres LSN');
  if(args.sourceTimestamp!==undefined&&
     (typeof args.sourceTimestamp!=='string'||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(args.sourceTimestamp)||
      !Number.isFinite(Date.parse(args.sourceTimestamp))||
      Date.parse(args.sourceTimestamp)>Date.now()))
   throw Error('Restore timestamp must be valid UTC in the past');
 }
 return {target:'branch:'+t.id,projectId:state.projectId,branchId:t.id,
  before:{id:t.id,name:t.name,updatedAt:t.updated_at??null,
   lastResetAt:t.last_reset_at??null,sourceId,preserveName,
   branchCount:state.list.length},
  summary:(kind==='reset'?'RESET from parent ':'RESTORE history from ')+sourceId+
   ' onto '+t.id+'; keep the entire old branch as '+preserveName+
   '; additional branch may incur monthly charges; confirmation required'};
}
async function price(_a,ctx,before){
 const plan=typeof ctx.db.getVerifiedNeonPlan==='function'
  ?await ctx.db.getVerifiedNeonPlan(ctx.connection.neonOrg):await ctx.planFor?.();
 if(plan?.verified!==true||!['Launch','Scale'].includes(plan.name))
  return null;
 return createSpendGuard({db:ctx.db}).price({kind:'branch',plan:plan.name,
  before:{count:before.branchCount},after:{count:before.branchCount+1}});
}
async function mutation(args,ctx,{before,requestKey}){
 const {projectId,branchId}=targetIds(args,ctx);
 return applyNeonWrite({client:await ctx.clientFor(projectId),
  operationId:'restoreProjectBranch',projectId,requestKey,
  params:{path:path(projectId,branchId),body:{
   source_branch_id:before.sourceId,
   ...(args.sourceLsn?{source_lsn:args.sourceLsn}:{}),
   ...(args.sourceTimestamp?{source_timestamp:args.sourceTimestamp}:{}),
   preserve_under_name:before.preserveName
  }}});
}
async function after(args,ctx){
 const state=await dataFor(args,ctx);
 return {target:state.target,branches:state.list};
}
function verify(before,now){
 if(now?.target?.id!==before.id||!Array.isArray(now.branches))return false;
 const saved=now.branches.find(b=>b.name===before.preserveName);
 if(!saved||saved.id===before.id||saved.project_id!==now.target.project_id)
  return false;
 // If the provider did not report a state transition, do not claim success.
 return (now.target.last_reset_at!=null&&
         now.target.last_reset_at!==before.lastResetAt)||
        (now.target.updated_at!=null&&
         now.target.updated_at!==before.updatedAt);
}
const reset=defineWrite({name:'neon_branch_reset_from_parent',
 destructive:true,spend:price,plan:(a,c)=>preview(a,c,'reset'),
 apply:mutation,readAfter:after,verify});
const restore=defineWrite({name:'neon_branch_restore',
 destructive:true,spend:price,plan:(a,c)=>preview(a,c,'restore'),
 apply:mutation,readAfter:after,verify});
const definitions=[
 [reset,'Reset a branch from its parent while preserving the previous state.',schema({},['branchId'])],
 [restore,'Restore a branch from a verified LSN or timestamp, preserving its prior state.',
  schema({sourceBranchId:id,
   sourceLsn:{type:'string',pattern:'^[0-9a-fA-F]+/[0-9a-fA-F]+$'},
   sourceTimestamp:{type:'string',format:'date-time'}},['branchId','sourceBranchId'])]
];
export const tools=definitions.map(([def,description,inputSchema])=>({
 ...def.tool,profiles:['full'],area:'branches',audience:['owner','operator'],
 description,inputSchema}));
export function createBranchRestoreHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(definitions.map(([def])=>[def.tool.name,
  async(args,ctx)=>def.handler(args,await contextFor(ctx))]));
}
export const handlers=createBranchRestoreHandlers();
