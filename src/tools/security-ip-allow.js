// D-8 verified Scale-plan IP allowance. Never infer absent provider settings or app egress.
import {isIP} from 'node:net';
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectRead,projectScope} from './project-context.js';

function address(value){
 if(typeof value!=='string'||value.length>49||value.trim()!==value)return false;
 const p=value.split('/');
 if(p.length>2||!isIP(p[0]))return false;
 if(p.length===1)return true;
 if(!/^(0|[1-9][0-9]{0,2})$/.test(p[1]))return false;
 return Number(p[1])<=(isIP(p[0])===4?32:128);
}
function validate(ips){
 if(!Array.isArray(ips)||ips.length>12||ips.some(x=>!address(x))||
    new Set(ips.map(x=>x.toLowerCase())).size!==ips.length)
  throw Error('IP allowance requires at most 12 unique literal addresses/CIDRs');
 return ips;
}
function projectId(a,c){
 const id=projectScope(c,a.projectId??null).projectId;
 if(!id||c.connection.profile!=='full')throw Error('Full owner project connection required');
 return id;
}
async function state(a,c){
 const id=projectId(a,c);
 // A project key cannot establish its own paid-plan entitlement.
 // Live runtime exposes an authenticated provider-side organization lookup via
 // planFor; the optional durable snapshot alone may be outdated or unavailable.
 // Never fall back to a cached Scale claim if the live read fails or downgrades.
 const plan=typeof c.planFor==='function'
  ?await c.planFor()
  :await c.db.getVerifiedNeonPlan?.(c.connection.neonOrg);
 if(plan?.verified!==true||plan.name!=='Scale')
  throw Error('A verified existing Scale plan is required; this tool cannot upgrade plans');
 const p=(await projectRead(await c.clientFor(id),'getProject',
  {path:{project_id:id}}))?.project;
 if(p?.id!==id||p.org_id!==c.connection.neonOrg)
  throw Error('IP allowance project identity not verified');
 const v=p.settings?.allowed_ips;
 if(!v||typeof v!=='object'||Array.isArray(v)||
    typeof v.protected_branches_only!=='boolean')
  throw Error('Current IP allowance is unknown');
 validate(v.ips);
 return {project:p,allow:{ips:[...v.ips],protected_branches_only:v.protected_branches_only}};
}
function proposed(a,prior){
 if(!['add','remove','replace'].includes(a.action))throw Error('Invalid IP change action');
 const items=validate(a.ips);
 if(items.length===0)throw Error('Supply addresses for the selected IP change');
 const key=s=>s.toLowerCase(), old=new Set(prior.ips.map(key));
 let next;
 if(a.action==='replace')next=[...items];
 else if(a.action==='add'){
  if(items.some(x=>old.has(key(x))))throw Error('IP already in allowance');
  next=[...prior.ips,...items];
 }else{
  if(items.some(x=>!old.has(key(x))))throw Error('IP not in allowance');
  const removed=new Set(items.map(key));
  next=prior.ips.filter(x=>!removed.has(key(x)));
 }
 validate(next);
 // Never allow an empty list to silently disable/reconfigure the network policy.
 if(next.length===0)throw Error('An empty IP allowance must be reviewed separately');
 const protectedOnly=a.protectedBranchesOnly??prior.protected_branches_only;
 if(typeof protectedOnly!=='boolean')throw Error('Invalid protected-branches choice');
 if(next.length===prior.ips.length&&
    next.every((x,i)=>x===prior.ips[i])&&protectedOnly===prior.protected_branches_only)
  throw Error('IP allowance would not change');
 return {ips:next,protected_branches_only:protectedOnly};
}
const def=defineWrite({name:'neon_security_set_ip_allow',
 access:true,projectWide:true,
 plan:async(a,c)=>{
  const {project,allow}=await state(a,c),after=proposed(a,allow);
  const list=after.ips.join(', ');
  return {projectId:project.id,target:'project:'+project.id,before:{project,allow},
   summary:'Change project '+project.id+' IP allowance to ['+list+'] ('+
    (after.protected_branches_only?'protected branches':'all branches')+
    '). Vercel dynamic egress has no guaranteed fixed IP; this may block all application connections. Verify required app addresses before confirming. Existing Scale entitlement only; no plan upgrade.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await state(a,c);
  if(JSON.stringify(now.allow)!==JSON.stringify(before.allow))
   throw Error('IP allowance changed since preview; refuse write');
  const next=proposed(a,before.allow);
  return applyNeonWrite({client:await c.clientFor(before.project.id),
   operationId:'updateProject',params:{path:{project_id:before.project.id},
    body:{project:{settings:{allowed_ips:next}}}},
   projectId:before.project.id,requestKey});
 },
 readAfter:async(a,c)=>(await state(a,c)),
 verify:(before,after,a)=>after?.project?.id===before.project.id&&
  after.project.org_id===before.project.org_id&&
  JSON.stringify(after.allow)===JSON.stringify(proposed(a,before.allow))
});
export const tools=[{...def.tool,profiles:['full'],area:'security',audience:['owner'],
 description:'Preview guarded Scale-plan IP allowance add/remove/replace, with exact final list, Vercel egress warning and verified readback.',
 inputSchema:{type:'object',properties:{
  projectId:{type:'string',pattern:'^[a-z0-9-]{1,60}$'},
  action:{type:'string',enum:['add','remove','replace']},
  ips:{type:'array',items:{type:'string',minLength:1,maxLength:49},minItems:1,maxItems:12},
  protectedBranchesOnly:{type:'boolean'},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},
 required:['action','ips'],additionalProperties:false}}];
export function createSecurityIpHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_security_set_ip_allow:async(args,ctx)=>def.handler(args,await contextFor(ctx))};
}
export const handlers=createSecurityIpHandlers();
