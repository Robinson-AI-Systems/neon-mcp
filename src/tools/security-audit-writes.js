// D-8: owner-confirmed, no-spend reduction of the existing audit log level.
// Increasing audit volume or enabling a paid plan is intentionally unavailable.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectScope,projectRead} from './project-context.js';

const order=Object.freeze({base:0,extended:1,full:2});
const levels=Object.keys(order);
function fingerprint(project){
 const settings=project?.settings;
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||
    !levels.includes(settings.audit_log_level))
  throw Error('The current audit log level is not observed and verified');
 const rest={...settings};
 delete rest.audit_log_level;
 return JSON.stringify(rest);
}
async function current(a,c){
 const pid=projectScope(c,a.projectId??null).projectId;
 if(!pid||c.connection.profile!=='full')
  throw Error('Full owner project scope required to change audit logging');
 const p=(await projectRead(await c.clientFor(pid),'getProject',
  {path:{project_id:pid}}))?.project;
 if(p?.id!==pid||p.org_id!==c.connection.neonOrg)
  throw Error('Audit logging project/organization identity unverified');
 fingerprint(p);
 return p;
}
function choose(a,before){
 const next=a.level;
 if(!levels.includes(next)||order[next]>=order[before.settings.audit_log_level])
  throw Error('Only a strictly lower existing audit logging level is supported without verified cost and authorization');
 return next;
}
const definition=defineWrite({
 name:'neon_security_set_audit_log_level',
 projectWide:true,access:true,
 plan:async(a,c)=>{
  const before=await current(a,c),next=choose(a,before);
  return {target:'project:'+before.id,projectId:before.id,before,
   summary:'REDUCE project '+before.id+' audit logging from '+
    before.settings.audit_log_level+' to '+next+
    '. This immediately lowers audit event detail and may impair security investigations and compliance. '+
    'Explicit independent owner approval is required; increasing volume or estimated cost is not supported.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await current(a,c),next=choose(a,before);
  if(now.settings.audit_log_level!==before.settings.audit_log_level||
     fingerprint(now)!==fingerprint(before))
   throw Error('Project audit/security policy changed after preview; do not apply');
  return applyNeonWrite({client:await c.clientFor(before.id),
   operationId:'updateProject',
   params:{path:{project_id:before.id},
    body:{project:{settings:{audit_log_level:next}}}},
   projectId:before.id,requestKey});
 },
 readAfter:current,
 verify:(before,after,a)=>after?.id===before.id&&
  after.org_id===before.org_id&&
  after.settings?.audit_log_level===a.level&&
  fingerprint(after)===fingerprint(before)
});
export const tools=[{...definition.tool,profiles:['full'],
 area:'security',audience:['owner'],
 description:'Owner-confirmed reduction of existing project audit log verbosity; never increases logging cost or activates production.',
 inputSchema:{type:'object',properties:{
  projectId:{type:'string',pattern:'^[a-z0-9-]{1,60}$'},
  level:{type:'string',enum:['base','extended','full']},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},required:['level'],additionalProperties:false}}];
export function createSecurityAuditWriteHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_security_set_audit_log_level:async(a,c)=>
  definition.handler(a,await contextFor(c))};
}
export const handlers=createSecurityAuditWriteHandlers();
