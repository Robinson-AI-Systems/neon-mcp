// D-4: owner-visible role retirement inventory. Never authorizes deletion.
import {projectScope,projectClient,projectRead} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {roleSchema,roleName} from './role-write-shared.js';

const id=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const name=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(x);
const required=['branchId','roleName'];
const spec=defineReadTool('neon_role_retirement_review',
 'Map verified Neon databases and computes affected by retiring a role; deletion remains unavailable.',
 {projectId:readId,branchId:readId,roleName:roleSchema},
 {area:'roles',audience:['owner']});
export const tools=[{...spec,profiles:['full'],
 inputSchema:{...spec.inputSchema,required}}];

function complete(data,key,limit,valid,identity){
 const rows=data?.[key];
 if(!Array.isArray(rows)||rows.length>limit||data.pagination?.cursor||
    !rows.every(valid))throw Error('A complete scoped role retirement inventory is unavailable');
 const identities=rows.map(identity);
 if(identities.some(x=>!x)||new Set(identities).size!==identities.length)
  throw Error('Duplicated role retirement identity');
 return rows;
}
export function createRoleRetirementHandlers({getClient=projectClient}={}){
 return {
  async neon_role_retirement_review(a,c){
   if(c?.connection?.profile!=='full'||!id(a?.branchId)||!roleName(a?.roleName))
    throw Error('Owner and exact role identity required');
   const scoped=projectScope(c,a.projectId??null),pid=scoped.projectId,bid=a.branchId;
   if(!pid)throw Error('An enrolled project is required');
   const supplied=await getClient(c,pid);
   const client=supplied.client;
   const path={project_id:pid,branch_id:bid};
   const [p,b,r,databases,roles,endpoints]=await Promise.all([
    projectRead(client,'getProject',{path:{project_id:pid}}),
    projectRead(client,'getProjectBranch',{path}),
    projectRead(client,'getProjectBranchRole',{path:{...path,role_name:a.roleName}}),
    projectRead(client,'listProjectBranchDatabases',{path}),
    projectRead(client,'listProjectBranchRoles',{path}),
    projectRead(client,'listProjectEndpoints',{path:{project_id:pid}})
   ]);
   if(p?.project?.id!==pid||p.project.org_id!==scoped.org||
      b?.branch?.id!==bid||b.branch.project_id!==pid||
      !name(b.branch.name)||typeof b.branch.default!=='boolean'||
      typeof b.branch.protected!=='boolean'||
      r?.role?.name!==a.roleName||r.role.branch_id!==bid||
      r.role.protected!==false)
    throw Error('Scoped role or branch could not be independently verified');
   const dbRows=complete(databases,'databases',100,
    d=>d.branch_id===bid&&name(d.name)&&roleName(d.owner_name),d=>d.name);
   const roleRows=complete(roles,'roles',100,
    x=>x.branch_id===bid&&roleName(x.name)&&typeof x.protected==='boolean',
    x=>x.name);
   if(roleRows.filter(x=>x.name===a.roleName&&x.protected===false).length!==1)
    throw Error('Requested role was not in the complete provider role inventory');
   const allComputes=complete(endpoints,'endpoints',32,
    e=>id(e.id)&&id(e.project_id)&&id(e.branch_id)&&e.project_id===pid,
    e=>e.id);
   const chosen=allComputes.filter(e=>e.branch_id===bid);
   if(chosen.length>16)throw Error('Branch compute inventory exceeds the review bound');
   const detail=[];
   for(const ep of chosen){
    const exact=(await projectRead(client,'getProjectEndpoint',{
      path:{project_id:pid,endpoint_id:ep.id}}))?.endpoint;
    if(exact?.id!==ep.id||exact.project_id!==pid||exact.branch_id!==bid||
       exact.type!==ep.type||exact.current_state!==ep.current_state||
       exact.pooler_enabled!==ep.pooler_enabled)
      throw Error('Endpoint state changed during role retirement review');
    detail.push({id:ep.id,type:ep.type??null,state:ep.current_state??null,
      providerPoolerEnabled:typeof ep.pooler_enabled==='boolean'?ep.pooler_enabled:null,
      idlePooledClients:'notObservable'});
   }
   const owned=dbRows.filter(d=>d.owner_name===a.roleName).map(d=>d.name);
   return readText({projectId:pid,branchId:bid,roleName:a.roleName,
    source:{name:b.branch.name,default:b.branch.default,
      protected:b.branch.protected},
    databasesInBranch:dbRows.length,ownedDatabases:owned,
    computes:detail,computeCount:detail.length,
    postgresDependencies:'notEvaluated',
    externalConsumers:'notVerified',
    idlePooledClients:'notObservable',
    safeToDelete:false,roleDeleteRegistered:false,
    nextActions:[
     'Identify every application, job and secret store using this role outside Neon',
     'Provision and test a replacement role on an authorized isolated development branch',
     'Move and independently verify every consumer before retiring old credentials',
     'Obtain a supported managed-pooler drain proof or approved disruptive retirement design',
     'Do not delete the role while client or ownership dependencies remain unknown'
    ]});
  }
 };
}
export const handlers=createRoleRetirementHandlers();
