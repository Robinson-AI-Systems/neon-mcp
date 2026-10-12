// D-2 guarded branch metadata changes; all mutations use audited B-1 and trusted Neon read-back.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {projectScope,projectRead} from './project-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const controls={projectId:id,branchId:id,dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128},outsideApp:{type:'boolean'}};
const schema=(specific,required)=>({type:'object',properties:{...controls,...specific},
 required,additionalProperties:false});
const validName=v=>typeof v==='string'&&v.length>=1&&v.length<=256&&
 !/[\x00-\x1f\x7f]/.test(v);
function selected(a,c){
 const projectId=projectScope(c,a.projectId??null).projectId;
 if(!projectId||typeof a.branchId!=='string'||!/^[a-z0-9-]{1,60}$/.test(a.branchId))
  throw Error('A scoped project and branch are required');
 return {projectId,branchId:a.branchId};
}
async function load(a,c){
 const {projectId,branchId}=selected(a,c),client=await c.clientFor(projectId);
 const info=await projectRead(client,'getProject',{path:{project_id:projectId}});
 if(info?.project?.id!==projectId||info.project.org_id!==c.connection.neonOrg)
  throw Error('Project identity could not be verified');
 const body=await projectRead(client,'getProjectBranch',{
  path:{project_id:projectId,branch_id:branchId}});
 if(body?.branch?.id!==branchId||body.branch.project_id!==projectId)
  throw Error('Branch identity could not be verified');
 return body.branch;
}
const run=async(a,c,field,key)=>{
 const {projectId,branchId}=selected(a,c);
 return applyNeonWrite({client:await c.clientFor(projectId),operationId:'updateProjectBranch',
  params:{path:{project_id:projectId,branch_id:branchId},body:{branch:field}},
  projectId,requestKey:key});
};
const rename=defineWrite({name:'neon_branch_rename',
 plan:async(a,c)=>{
  if(!validName(a.name))throw Error('Invalid branch name');
  const before=await load(a,c);
  if(before.name===a.name)throw Error('Branch is already named that');
  return {target:'branch:'+before.id,projectId:before.project_id,branchId:before.id,
   before,summary:'Rename branch '+before.id+' to '+a.name+
   (before.default===true||before.protected===true?'; attached applications may break':'')};
 },
 apply:(a,c,{requestKey:key})=>run(a,c,{name:a.name},key),
 readAfter:load,
 verify:(before,after,a)=>after?.id===before.id&&after.name===a.name
});
const protect=defineWrite({name:'neon_branch_set_protected',access:true,
 plan:async(a,c)=>{
  if(typeof a.protected!=='boolean')throw Error('Protection must be a boolean');
  const before=await load(a,c);
  if(before.protected===a.protected)throw Error('Protection already set');
  return {target:'branch:'+before.id,projectId:before.project_id,branchId:before.id,
   before,summary:(a.protected?'Protect ':'REMOVE PROTECTION FROM ')+before.id+
    (a.protected?'; guards will prevent accidental changes':
     '; production owner authorization and confirmation are required')};
 },
 apply:(a,c,{requestKey:key})=>run(a,c,{protected:a.protected},key),
 readAfter:load,
 verify:(before,after,a)=>after?.id===before.id&&after.protected===a.protected
});

// D-2 branch expiry (EA feature) and default branch transfer.
const expiry=defineWrite({name:'neon_branch_set_expiration',
 plan:async(a,c)=>{
  if((a.remove===true)===(a.expiresAt!==undefined))
   throw Error('Provide exactly one of expiresAt or remove:true');
  let value=null;
  if(a.remove!==true){
   if(typeof a.expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(a.expiresAt))
    throw Error('Expiration must be a UTC second-precision timestamp');
   const date=Date.parse(a.expiresAt),now=Date.now();
   if(!Number.isFinite(date)||date<=now||date>now+30*86400000)
    throw Error('Expiration must be within the next 30 days');
   value=a.expiresAt;
  }
  const before=await load(a,c);
  if(before.default===true||before.protected===true)
   throw Error('Expiration forbidden on default or protected branch');
  const client=await c.clientFor(before.project_id);
  const listing=await projectRead(client,'listProjectBranches',{
   path:{project_id:before.project_id},query:{limit:100}});
  if(!Array.isArray(listing.branches)||listing.pagination?.cursor||
     listing.branches.some(b=>b.project_id!==before.project_id)||
     listing.branches.some(b=>b.parent_id===before.id))
   throw Error('Cannot verify this is a safe leaf branch');
  if((before.expires_at??null)===value)throw Error('Expiration unchanged');
  return {target:'branch:'+before.id,projectId:before.project_id,branchId:before.id,before,
   summary:value?'Schedule leaf branch '+before.id+' to expire at '+value:
    'Remove automatic expiration from leaf branch '+before.id};
 },
 apply:(a,c,{requestKey:key})=>run(a,c,{expires_at:a.remove===true?null:a.expiresAt},key),
 readAfter:load,
 verify:(before,after,a)=>before.id===after?.id&&
  (after.expires_at??null)===(a.remove===true?null:a.expiresAt)
});
const defaultBranch=defineWrite({name:'neon_branch_set_default',projectWide:true,
 plan:async(a,c)=>{
  const before=await load(a,c);
  if(before.default===true)throw Error('Branch already is the project default');
  const client=await c.clientFor(before.project_id);
  const data=await projectRead(client,'listProjectBranches',{
   path:{project_id:before.project_id},query:{limit:100}});
  if(!Array.isArray(data.branches)||data.pagination?.cursor||
     data.branches.some(b=>b.project_id!==before.project_id))
   throw Error('Incomplete default branch listing');
  const old=data.branches.filter(b=>b.default===true);
  if(old.length!==1||data.branches.filter(b=>b.id===before.id).length!==1)
   throw Error('Cannot identify existing project default');
  return {target:'project:'+before.project_id,projectId:before.project_id,
   before:{target:before,prior:old[0].id},
   summary:'PRODUCTION default switch from '+old[0].id+' to '+before.id+
    '; application connection routing may change; owner confirmation required'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const {projectId,branchId}=selected(a,c);
  return applyNeonWrite({client:await c.clientFor(projectId),
   operationId:'setDefaultProjectBranch',
   params:{path:{project_id:projectId,branch_id:branchId}},
   projectId,requestKey:key});
 },
 readAfter:async(a,c)=>{
  const selectedIds=selected(a,c),client=await c.clientFor(selectedIds.projectId);
  const data=await projectRead(client,'listProjectBranches',{
   path:{project_id:selectedIds.projectId},query:{limit:100}});
  if(!Array.isArray(data.branches)||data.pagination?.cursor||
     data.branches.some(b=>b.project_id!==selectedIds.projectId))
   return null;
  return data.branches;
 },
 verify:(before,after)=>Array.isArray(after)&&
  after.filter(b=>b.default===true).length===1&&
  after.some(b=>b.id===before.target.id&&b.default===true)&&
  after.some(b=>b.id===before.prior&&b.default===false)
});

const specs=[
 [rename,'Rename a branch after scope and production approval.',schema({
  name:{type:'string',minLength:1,maxLength:256}},['branchId','name']),['everyday','full']],
 [protect,'Protect or unprotect a branch with audited confirmation.',schema({
  protected:{type:'boolean'}},['branchId','protected']),['full']],
 [expiry,'Set or remove expiry on a non-protected leaf branch within 30 days.',schema({
  expiresAt:{type:'string',format:'date-time'},remove:{type:'boolean'}},['branchId']),['everyday','full']],
 [defaultBranch,'Switch project default branch with audited production approval.',schema({},['branchId']),['full']]
];
export const tools=specs.map(([def,description,inputSchema,profiles])=>({
 ...def.tool,description,inputSchema,profiles,area:'branches',audience:['owner','operator']}));
export function createBranchWriteHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(specs.map(([def])=>[def.tool.name,async(args,ctx)=>
  def.handler(args,await contextFor(ctx))]));
}
export const handlers=createBranchWriteHandlers();
