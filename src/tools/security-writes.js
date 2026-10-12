// D-8 owner-only project network access changes. Never infer missing provider settings.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectRead,projectScope} from './project-context.js';

function targetProject(args,ctx){
 const id=projectScope(ctx,args.projectId??null).projectId;
 if(!id)throw Error('Choose an authorized project');
 if(ctx.connection.profile!=='full')throw Error('Only owner connections can change network access');
 return id;
}
async function load(args,ctx){
 const id=targetProject(args,ctx);
 const p=(await projectRead(await ctx.clientFor(id),'getProject',
  {path:{project_id:id}}))?.project;
 if(p?.id!==id||p.org_id!==ctx.connection.neonOrg)
  throw Error('Project and owner identity are not independently verified');
 const s=p.settings;
 if(!s||typeof s!=='object'||Array.isArray(s)||
    typeof s.block_public_connections!=='boolean'||
    typeof s.block_vpc_connections!=='boolean')
  throw Error('Current network access is unknown; no safe update is possible');
 return p;
}
const flags={public:'block_public_connections',vpc:'block_vpc_connections'};
function selected(args){
 const requested={};
 for(const [arg,field] of Object.entries(flags)){
  const name=arg==='public'?'blockPublic':'blockVpc';
  if(args[name]!==undefined){
   if(typeof args[name]!=='boolean')throw Error('Network access values must be boolean');
   requested[field]=args[name];
  }
 }
 if(!Object.keys(requested).length)throw Error('Choose at least one network access setting');
 return requested;
}
const update=defineWrite({
 name:'neon_security_set_public_access',projectWide:true,access:true,
 plan:async(args,ctx)=>{
  const before=await load(args,ctx);
  const changes=selected(args);
  const after={...{
   block_public_connections:before.settings.block_public_connections,
   block_vpc_connections:before.settings.block_vpc_connections
  },...changes};
  if(after.block_public_connections&&after.block_vpc_connections)
   throw Error('Blocking both access paths risks complete lockout');
  if(Object.entries(changes).every(([k,v])=>before.settings[k]===v))
   throw Error('No changed network setting');
  const readable=k=>after[k]?'blocked':'allowed';
  return {target:'project:'+before.id,projectId:before.id,before,
   summary:'Change project '+before.id+' network access: public '+readable('block_public_connections')+
    ', VPC '+readable('block_vpc_connections')+
    '. This may immediately disconnect applications; independently verify access afterward.'};
 },
 apply:async(args,ctx,{before,requestKey})=>{
  // Refuse stale previews, including unseen changes to the untargeted access path.
  const current=await load(args,ctx);
  if(current.settings.block_public_connections!==before.settings.block_public_connections||
     current.settings.block_vpc_connections!==before.settings.block_vpc_connections)
   throw Error('Network settings changed after preview');
  const project={settings:selected(args)};
  return applyNeonWrite({client:await ctx.clientFor(before.id),
   operationId:'updateProject',params:{path:{project_id:before.id},body:{project}},
   projectId:before.id,requestKey});
 },
 readAfter:load,
 verify:(before,after,args)=>{
  if(after?.id!==before.id||after.org_id!==before.org_id)return false;
  const changes=selected(args);
  return Object.keys(flags).every(k=>{
   const field=flags[k];
   return after.settings[field]===(changes[field]??before.settings[field]);
  });
 }
});
export const tools=[{...update.tool,profiles:['full'],area:'security',
 audience:['owner'],description:'Preview and confirm project public/VPC network restrictions with protected-resource checks and exact readback.',
 inputSchema:{type:'object',properties:{
  projectId:{type:'string',pattern:'^[a-z0-9-]{1,60}$'},
  blockPublic:{type:'boolean'},blockVpc:{type:'boolean'},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},additionalProperties:false}}];
export function createSecurityWriteHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_security_set_public_access:async(args,ctx)=>
  update.handler(args,await contextFor(ctx))};
}
export const handlers=createSecurityWriteHandlers();
