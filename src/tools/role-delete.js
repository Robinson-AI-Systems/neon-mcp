// Explicit retirement consent is not evidence that managed pool clients are absent.
import {createHash,randomBytes} from 'node:crypto';
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {inspectRoleDeleteReadiness} from './role-delete-inventory.js';
import {roleBranch,existingRole,roleName,roleSchema,schema} from './role-write-shared.js';
import {call} from '../neon/client.js';
import {waitForOperations} from '../neon/operations.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
function identity(a,c,report){
 const connectionId=c.connectionId??c.connection?.clientId;
 if(typeof connectionId!=='string'||!connectionId||c.connection?.profile!=='full'||
   typeof c.db?.recordRoleRetirementPreview!=='function'||
   typeof c.db?.consumeRoleRetirementPreview!=='function')
  throw Error('Durable owner-bound retirement preview unavailable');
 if(report.verified!==true||report.poolerClientsVerified!==false||
   report.roleName!==a.roleName||report.branchId!==a.branchId||
   !Array.isArray(report.computes)||!report.computes.length||
   typeof report.roleRevision!=='string'||!Number.isFinite(Date.parse(report.roleRevision)))
  throw Error('Role retirement identity or revision unverified');
 for(const f of report.computes){
  if(!Number.isSafeInteger(f.roleOid)||f.roleOid<1||
    !Array.isArray(f.memberships)||!f.totals||
    ['objectReferences','databaseOwnerships','activeSessions'].some(k=>f.totals[k]!==0)||
    !Number.isSafeInteger(f.totals.roleMemberships)||
    f.memberships.length!==f.totals.roleMemberships)
   throw Error('Ownership, reference, session or membership evidence blocks retirement');
 }
 if(new Set(report.computes.map(f=>f.roleOid)).size!==1)
  throw Error('Role identity differs across computes');
 const target={projectId:report.projectId,branchId:report.branchId,roleName:a.roleName};
 const fingerprint=hash(JSON.stringify({connectionId,org:c.connection.neonOrg,
  mode:c.connection.mode,target,revision:report.roleRevision,
  monitor:[a.monitorDatabase,a.monitorRole],computes:[...report.computes]
   .sort((x,y)=>x.endpointId.localeCompare(y.endpointId))}));
 return {connectionId,target,fingerprint};
}
const defaultInspect=(a,c)=>inspectRoleDeleteReadiness(a,c,{retirement:true});
function operationFor(inspect){
 return defineWrite({name:'neon_role_delete',destructive:true,access:true,
  plan:async(a,c)=>{
   if(a.roleName?.startsWith('pg_')||['neon_superuser','neon_service','cloud_admin',
     'zenith_admin','public','none'].includes(a.roleName))throw Error('Reserved role');
   const report=await inspect({...a,outsideApp:false},c),binding=identity(a,c,report);
   // This initial path cannot certify application migrations. A generic
   // outsideApp acknowledgement must not stand in for that evidence.
   if(await c.guards?.checkApp?.({target:'branch:'+report.branchId,
     projectId:report.projectId,branchId:report.branchId},c,{...a,outsideApp:false})!==true)
    throw Error('Application-owned retirement requires independently verified migration');
   if(a.confirm===true&&a.dryRun!==true&&
     (a.acknowledgeConnectionInterruption!==true||a.confirmRoleName!==a.roleName||
      typeof a.retirementConsent!=='string'||
      !/^[A-Za-z0-9_-]{43}$/.test(a.retirementConsent)))
    throw Error('Exact role acknowledgement and recorded preview required');
   c.retirementPreview={report,binding};
   return {target:'branch:'+report.branchId,projectId:report.projectId,
    branchId:report.branchId,before:{...binding,revision:report.roleRevision},
    summary:'PERMANENTLY DELETE role '+a.roleName+' on branch '+report.branchId+
     '; pooled clients and external consumers UNKNOWN: undiscovered apps may fail. '+
     'No visible sessions or object dependencies; '+report.computes[0].memberships.length+
     ' role memberships will be removed. No database/object deletion or session termination'};
  },
  apply:async(a,c,{before,requestKey})=>{
   // Repeat every provider and SQL dependency check after the audited reservation.
   const current=identity(a,c,await inspect({...a,outsideApp:false},c));
   if(current.fingerprint!==before.fingerprint)return {confirmed:false};
   const consent=await c.db.consumeRoleRetirementPreview({orgId:c.connection.neonOrg,
    connectionId:current.connectionId,target:current.target,
    tokenHash:hash(a.retirementConsent),identityHash:current.fingerprint});
   if(!consent)return {confirmed:false};
   const t=await existingRole(a,c);
   if(t.role.protected!==false||t.role.updated_at!==before.revision)return {confirmed:false};
   const reply=await call(t.client,'deleteProjectBranchRole',{
    path:{...t.path,role_name:a.roleName}
   },{write:true,requestKey});
   if(reply.error)return {confirmed:reply.confirmed===null?'pending':false};
   if(reply.data?.role&&(reply.data.role.name!==a.roleName||reply.data.role.branch_id!==t.bid))
    return {confirmed:'pending'};
   if(reply.operations?.length){
    const done=await waitForOperations(t.client,t.pid,reply.operations,{budgetMs:15000});
    if(done.confirmed!==true)return {confirmed:'pending',operations:done.operations};
   }
   return {confirmed:true,operations:reply.operations||[]};
  },
  readAfter:async(a,c)=>{
   const t=await roleBranch(a,c);
   const exact=await call(t.client,'getProjectBranchRole',{
    path:{...t.path,role_name:a.roleName}});
   const list=await call(t.client,'listProjectBranchRoles',{path:t.path});
   return {absent:exact.error?.status===404&&!list.error&&
    Array.isArray(list.data?.roles)&&!list.data.pagination?.cursor&&
    list.data.roles.length<=100&&list.data.roles.every(r=>r.branch_id===t.bid&&
      roleName(r.name))&&
    new Set(list.data.roles.map(r=>r.name)).size===list.data.roles.length&&
    !list.data.roles.some(r=>r.name===a.roleName)};
  },verify:(_before,after)=>after?.absent===true
 });
}
export function createRoleDeleteHandlers({contextFor=createProjectWriteContext,inspect=defaultInspect}={}){
 const operation=operationFor(inspect);
 return {neon_role_delete:async(args,ctx)=>{
  const c=await contextFor(ctx);
  const result=await operation.handler(args,c),out=JSON.parse(result.content[0].text);
  if(args.dryRun===true&&out.preview&&c.retirementPreview){
   const {binding,report}=c.retirementPreview,token=randomBytes(32).toString('base64url');
   let saved;
   try{saved=await c.db.recordRoleRetirementPreview({orgId:c.connection.neonOrg,
    connectionId:binding.connectionId,target:binding.target,tokenHash:hash(token),
    identityHash:binding.fingerprint,summary:out.preview,
    production:out.preview.startsWith('PRODUCTION: ')});}
   catch{/* No raw database error or consent reference leaves a failed save. */}
   if(!saved)return {isError:true,content:[{type:'text',text:JSON.stringify({
    done:false,code:'preview_unavailable',message:'Retirement preview could not be durably recorded; no consent issued.'})}]};
   result.content[0].text=JSON.stringify({...out,retirementConsent:token,
    expiresInSeconds:600,roleMemberships:report.computes[0].memberships,pooledClientsVerified:false,externalConsumersVerified:false});
  }
  return result;
 }};
}
const metadata=operationFor(defaultInspect);
export const tools=[{...metadata.tool,profiles:['full'],area:'roles',audience:['owner'],
 description:'Retire one dependency-free role with an exact one-use preview and explicit connection-interruption acknowledgement.',
 inputSchema:schema({roleName:roleSchema,monitorRole:roleSchema,
  monitorDatabase:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'},
  acknowledgeConnectionInterruption:{type:'boolean'},confirmRoleName:roleSchema,
  retirementConsent:{type:'string',pattern:'^[A-Za-z0-9_-]{43}$'}},
 ['branchId','roleName','monitorRole','monitorDatabase'])}];
export const handlers=createRoleDeleteHandlers();
