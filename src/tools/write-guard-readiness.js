// Owner-only, non-mutating diagnostic for a specific externally managed write boundary.
// Not a preview, approval, permission grant, or substitute for the original B-1 guards.
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {projectScope,projectRead} from './project-context.js';
import {classifyTarget} from '../neon/production.js';
import {readText} from './read-descriptors.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
export const tools=[{
 name:'neon_write_guard_readiness',
 description:'Inspect trusted project/branch identity and owner write-guard refusals without changing anything.',
 area:'server',audience:['owner','builder'],writes:false,profiles:['full'],
 inputSchema:{type:'object',properties:{projectId:id,branchId:id},
  required:['projectId','branchId'],additionalProperties:false}
}];

async function guarded(check) {
 try{return await check()===true;}catch{return false;}
}
export function createWriteGuardReadinessHandlers({contextFor=createProjectWriteContext}={}){
 return {async neon_write_guard_readiness(a,raw){
  const c=await contextFor(raw);
  if(c.connection?.profile!=='full')throw Error('Owner profile required');
  const s=projectScope(c,a.projectId);
  if(!s.projectId||s.projectId!==a.projectId||!a.branchId)
   throw Error('Exact scoped project and branch required');
  if(!/^[a-z0-9-]{1,60}$/.test(a.branchId))
   throw Error('Invalid branch ID');
  const client=await c.clientFor(s.projectId);
  const project=await projectRead(client,'getProject',{path:{project_id:s.projectId}});
  if(project?.project?.id!==s.projectId||project.project.org_id!==s.org)
   throw Error('Project identity could not be verified');
  const target={projectId:s.projectId,branchId:a.branchId};
  const cls=await classifyTarget(c,target);
  if(cls.allowed!==true)throw Error('Independent branch classification unavailable');
  const protectedAllowed=await guarded(()=>c.guards.checkProtected(target,c));
  // This *must* use the same server-side app guard as B-1. Never infer
  // ownership from a project name, caller outsideApp flag or absent API fields.
  const appAllowed=await guarded(()=>c.guards.checkApp(target,c,{outsideApp:false}));
  const childDecision=await c.guards.checkProduction(target,c,{productionEffect:'none'});
  const directDecision=await c.guards.checkProduction(target,c,{productionEffect:'write'});
  return readText({
   projectId:s.projectId,branchId:a.branchId,identity:'provider_verified',
   branchKind:cls.kind,branchProduction:cls.production===true,
   protectedGate:protectedAllowed?'allowed':'refused_or_unavailable',
   appOwnershipGate:appAllowed?'verified_permitted':'app_owned_or_evidence_unavailable',
   childOnlyProductionGate:childDecision?.allowed===true?'allowed':'refused_or_unavailable',
   directMutationProductionGate:directDecision?.allowed===true?'allowed':'refused_or_unavailable',
   readyForMutation:false,
   caveat:'Diagnostic read only. All live B-1, spending, approval, audit, app and production gates still run independently for each write. No access was granted.'
  });
 }};
}
export const handlers=createWriteGuardReadinessHandlers();
