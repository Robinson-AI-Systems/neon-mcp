// D-2 branch lifecycle: audited creation, seven-day soft-delete and verified recovery.
import {defineWrite} from '../core/write.js';
import {projectScope,projectRead} from './project-context.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {createSpendGuard} from '../neon/spend.js';

const ID=/^[a-z0-9-]{1,60}$/;
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const opts={projectId:id,branchId:id,dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128},outsideApp:{type:'boolean'}};
const schema=(specific,required=[])=>({type:'object',properties:{...opts,...specific},
 required,additionalProperties:false});
const nameOk=n=>typeof n==='string'&&n.length>=1&&n.length<=256&&
 !/[\x00-\x1f\x7f]/.test(n);
function projectId(a,c){
 const p=projectScope(c,a.projectId??null).projectId;
 if(!p)throw Error('Choose a scoped project');
 return p;
}
function validateCreateOptions(a){
 if(a.parentLsn!==undefined&&a.parentTimestamp!==undefined)
  throw Error('Choose either parent LSN or UTC timestamp');
 if(a.parentLsn!==undefined&&(typeof a.parentLsn!=='string'||
    !/^[0-9a-f]+\/[0-9a-f]+$/i.test(a.parentLsn)))
  throw Error('Invalid parent LSN');
 for(const field of ['parentTimestamp','expiresAt']){
  if(a[field]===undefined)continue;
  if(typeof a[field]!=='string'||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(a[field])||
     !Number.isFinite(Date.parse(a[field])))throw Error('Invalid UTC timestamp');
  const delta=Date.parse(a[field])-Date.now();
  if(field==='parentTimestamp'&&delta>0)throw Error('Historical parent timestamp must be in the past');
  if(field==='expiresAt'&&(delta<=0||delta>30*86400000))
   throw Error('Branch expiration must be within 30 days');
 }
 if(a.protected!==undefined&&typeof a.protected!=='boolean')
  throw Error('Protected must be boolean');
 if(a.computeType!==undefined){
  if(!['read_write','read_only'].includes(a.computeType)||
     ![a.minCu,a.maxCu].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0.25&&n<=16)||
     a.maxCu<a.minCu)throw Error('Compute type and verified CU range required');
 }else if(a.minCu!==undefined||a.maxCu!==undefined)
  throw Error('Compute CU bounds require an explicit compute type');
}
async function clientFor(a,c){
 const pid=projectId(a,c),client=await c.clientFor(pid);
 const data=await projectRead(client,'getProject',{path:{project_id:pid}});
 if(data?.project?.id!==pid||data.project.org_id!==c.connection.neonOrg)
  throw Error('Unverified project identity');
 return {pid,client};
}
async function branches(client,pid,includeDeleted=false){
 const result=await projectRead(client,'listProjectBranches',{
  path:{project_id:pid},query:{limit:100,...(includeDeleted?{include_deleted:true}:{})}});
 if(!Array.isArray(result?.branches)||result.pagination?.cursor||
    result.branches.some(b=>b.project_id!==pid)||
    new Set(result.branches.map(b=>b.id)).size!==result.branches.length)
  throw Error('Neon branch list is incomplete or invalid');
 return result.branches;
}
async function existing(a,c){
 if(!ID.test(a.branchId||''))throw Error('Choose valid branch ID');
 const {pid,client}=await clientFor(a,c);
 const data=await projectRead(client,'getProjectBranch',{
  path:{project_id:pid,branch_id:a.branchId}});
 if(data?.branch?.id!==a.branchId||data.branch.project_id!==pid)
  throw Error('Unverified branch identity');
 return {pid,client,branch:data.branch};
}
async function apply(a,c,op,body,key){
 const pid=projectId(a,c);
 return applyNeonWrite({client:await c.clientFor(pid),operationId:op,
  params:{path:{project_id:pid,...(a.branchId?{branch_id:a.branchId}:{})},
   ...(body!==undefined?{body}:{})},projectId:pid,requestKey:key});
}
const create=defineWrite({name:'neon_branch_create',
 spend:async(_a,c,before)=>{
  const plan=typeof c.db.getVerifiedNeonPlan==='function'
   ?await c.db.getVerifiedNeonPlan(c.connection.neonOrg):await c.planFor?.();
  if(plan?.verified!==true||!['Launch','Scale'].includes(plan.name))
   return null;
  const guard=createSpendGuard({db:c.db});
  const branch=await guard.price({kind:'branch',plan:plan.name,
   before:{count:before.count},after:{count:before.count+1}});
  if(!branch?.canApply||!Number.isSafeInteger(branch.increaseCents))return null;
  if(!before.compute)return branch;
  const compute=await guard.price({kind:'compute',plan:plan.name,
   before:{maxCu:0},after:{maxCu:before.compute.maxCu}});
  if(!compute?.canApply||!Number.isSafeInteger(compute.increaseCents)||
     !Number.isSafeInteger(branch.increaseCents+compute.increaseCents))return null;
  return {...branch,increaseCents:branch.increaseCents+compute.increaseCents};
 },
 plan:async(a,c)=>{
  if(!nameOk(a.name)||!ID.test(a.parentBranchId||'')||
     (a.schemaOnly!==undefined&&typeof a.schemaOnly!=='boolean'))
   throw Error('Explicit parent and valid branch name required');
  validateCreateOptions(a);
  const {pid,client}=await clientFor(a,c);
  const list=await branches(client,pid);
  const parent=list.find(b=>b.id===a.parentBranchId);
  if(!parent||list.some(b=>b.name===a.name))
   throw Error('Parent missing or branch name already in use');
  return {target:'branch:'+parent.id,projectId:pid,branchId:parent.id,
   before:{parent,count:list.length,name:a.name,
    compute:a.computeType?{type:a.computeType,minCu:a.minCu,maxCu:a.maxCu}:null},
   summary:'Create branch '+a.name+' from verified parent '+parent.id+
    (a.schemaOnly===true?' (schema only)':' (parent data)')+
    (a.computeType?' with '+a.computeType+' compute up to '+a.maxCu+' CU':'')+
    (a.expiresAt?' expiring '+a.expiresAt:'')+
    '; estimated monthly branch and compute charge subject to owner caps'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const pid=projectId(a,c);
  const out=await applyNeonWrite({client:await c.clientFor(pid),
   operationId:'createProjectBranch',
   params:{path:{project_id:pid},body:{branch:{name:a.name,
    parent_id:a.parentBranchId,init_source:a.schemaOnly===true?'schema-only':'parent-data',
    ...(a.parentLsn?{parent_lsn:a.parentLsn}:{}),
    ...(a.parentTimestamp?{parent_timestamp:a.parentTimestamp}:{}),
    ...(a.expiresAt?{expires_at:a.expiresAt}:{}),
    ...(a.protected!==undefined?{protected:a.protected}:{})},
    ...(a.computeType?{endpoints:[{type:a.computeType,
     autoscaling_limit_min_cu:a.minCu,autoscaling_limit_max_cu:a.maxCu}]}:{})}},
   projectId:pid,requestKey:key});
  if(out.data?.branch?.project_id===pid&&ID.test(out.data.branch.id))
   c.createdBranchId=out.data.branch.id;
  return out;
 },
 readAfter:async(a,c)=>{
  if(!c.createdBranchId)return null;
  const {pid,client}=await clientFor(a,c);
  const result=await projectRead(client,'getProjectBranch',{
   path:{project_id:pid,branch_id:c.createdBranchId}});
  if(result.branch?.project_id!==pid||result.branch.id!==c.createdBranchId)return null;
  if(!a.computeType)return {branch:result.branch,computes:[]};
  const details=await projectRead(client,'listProjectBranchEndpoints',{
   path:{project_id:pid,branch_id:c.createdBranchId}});
  if(!Array.isArray(details?.endpoints)||details.endpoints.some(e=>
     e.project_id!==pid||e.branch_id!==c.createdBranchId))return null;
  return {branch:result.branch,computes:details.endpoints};
 },
 verify:(before,after,a)=>after?.branch?.name===before.name&&
  (a.schemaOnly===true?after.branch.parent_id==null:
   after.branch.parent_id===a.parentBranchId)&&after.branch.default!==true&&
  (a.expiresAt===undefined||after.branch.expires_at===a.expiresAt)&&
  (a.protected===undefined||after.branch.protected===a.protected)&&
  (!before.compute||(after.computes.length===1&&
    after.computes[0].type===before.compute.type&&
    after.computes[0].autoscaling_limit_min_cu===before.compute.minCu&&
    after.computes[0].autoscaling_limit_max_cu===before.compute.maxCu))
});
const del=defineWrite({name:'neon_branch_delete',destructive:true,
 plan:async(a,c)=>{
  const {pid,client,branch}=await existing(a,c);
  if(branch.default===true||branch.protected===true)
   throw Error('Cannot delete default or protected branch');
  const list=await branches(client,pid);
  if(list.some(b=>b.parent_id===branch.id))throw Error('Delete children first');
  const path={project_id:pid,branch_id:branch.id};
  const [endpoints,dbs]=await Promise.all([
   projectRead(client,'listProjectBranchEndpoints',{path}),
   projectRead(client,'listProjectBranchDatabases',{path})]);
  if(!Array.isArray(endpoints.endpoints)||!Array.isArray(dbs.databases))
   throw Error('Cannot enumerate deletion impact');
  return {target:'branch:'+branch.id,projectId:pid,branchId:branch.id,before:branch,
   summary:'Soft-delete '+branch.id+' with '+endpoints.endpoints.length+
   ' computes and '+dbs.databases.length+
   ' databases; recoverable within seven days; never permanently deleted'};
 },
 apply:(a,c,{requestKey:key})=>apply(a,c,'deleteProjectBranch',undefined,key),
 readAfter:async(a,c)=>{
  const {pid,client}=await clientFor(a,c);
  const [active,all]=await Promise.all([branches(client,pid),branches(client,pid,true)]);
  return {active:active.some(b=>b.id===a.branchId),
   recoverable:all.some(b=>b.id===a.branchId)};
 },
 verify:(_before,after)=>after?.active===false&&after?.recoverable===true
});
const recover=defineWrite({name:'neon_branch_recover',projectWide:true,
 plan:async(a,c)=>{
  if(!ID.test(a.branchId||''))throw Error('Choose branch to recover');
  const {pid,client}=await clientFor(a,c);
  const [active,all]=await Promise.all([branches(client,pid),branches(client,pid,true)]);
  if(active.some(b=>b.id===a.branchId))throw Error('Branch already active');
  const old=all.find(b=>b.id===a.branchId);
  if(!old)throw Error('Branch not in recoverable seven-day window');
  return {target:'project:'+pid,projectId:pid,before:{id:old.id},
   summary:'Recover soft-deleted branch '+old.id+' within provider grace period'};
 },
 apply:(a,c,{requestKey:key})=>apply(a,c,'recoverProjectBranch',undefined,key),
 readAfter:async(a,c)=>{
  const {pid,client}=await clientFor(a,c);
  return (await branches(client,pid)).find(b=>b.id===a.branchId)||null;
 },
 verify:(before,after)=>after?.id===before.id&&after.project_id!==undefined
});
const specs=[
 [create,'Create a branch from an explicitly selected parent with verified monthly cost.',
  schema({name:{type:'string',minLength:1,maxLength:256},parentBranchId:id,
   schemaOnly:{type:'boolean'},
   parentLsn:{type:'string',pattern:'^[0-9a-fA-F]+/[0-9a-fA-F]+$'},
   parentTimestamp:{type:'string',format:'date-time'},
   expiresAt:{type:'string',format:'date-time'},protected:{type:'boolean'},
   computeType:{type:'string',enum:['read_write','read_only']},
   minCu:{type:'number',minimum:0.25,maximum:16},
   maxCu:{type:'number',minimum:0.25,maximum:16}},['name','parentBranchId']),['everyday','full']],
 [del,'Soft-delete a leaf branch after impact preview, with seven-day recovery.',
  schema({},['branchId']),['full']],
 [recover,'Recover a deleted branch after owner project-wide approval.',
  schema({},['branchId']),['full']]
];
export const tools=specs.map(([def,description,inputSchema,profiles])=>({...def.tool,
 description,inputSchema,profiles,area:'branches',audience:['owner','operator']}));
export function createBranchLifecycleHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(specs.map(([def])=>[def.tool.name,async(a,ctx)=>
  def.handler(a,await contextFor(ctx))]));
}
export const handlers=createBranchLifecycleHandlers();
