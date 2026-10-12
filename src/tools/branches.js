// D-2 branch reads: org-bound project and branch identity, bounded and allowlisted output.
import {projectScope,projectClient,projectRead,projectPages,branchSummary,computeSummary} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';

export const tools=[
 defineReadTool('neon_branch_list','List bounded branches with safe default, protection and parent summaries.',{
  projectId:readId,limit:{type:'integer',minimum:1,maximum:100}}),
 defineReadTool('neon_branch_get','Inspect a branch, computes, databases and roles without credentials.',{
  projectId:readId,branchId:readId})
];
function target(args,ctx){
 const scope=projectScope(ctx,args.projectId??null);
 if(!scope.projectId)throw Error('Choose a project within the connection scope');
 return scope;
}
async function verifiedClient(args,ctx,getClient){
 const scope=target(args,ctx);
 const {client}=await getClient(ctx,scope.projectId);
 const data=await projectRead(client,'getProject',{path:{project_id:scope.projectId}});
 if(data?.project?.id!==scope.projectId||data.project.org_id!==scope.org)
  throw Error('Neon project identity mismatch');
 return {client,scope};
}
export function createBranchReadHandlers({getClient=projectClient}={}){
 return {
  async neon_branch_list(args,ctx){
   const {client,scope}=await verifiedClient(args,ctx,getClient);
   const page=await projectPages(client,'listProjectBranches',
    {path:{project_id:scope.projectId}},'branches',{max:args.limit??50});
   if(page.items.some(b=>b.project_id!==scope.projectId))
    throw Error('Branch belongs to a different project');
   return readText({branches:page.items.map(branchSummary),capped:page.capped,
    returned:page.items.length,projectId:scope.projectId});
  },
  async neon_branch_get(args,ctx){
   if(typeof args.branchId!=='string'||!/^[a-z0-9-]{1,60}$/.test(args.branchId))
    throw Error('Choose a valid branch ID');
   const {client,scope}=await verifiedClient(args,ctx,getClient);
   const path={project_id:scope.projectId,branch_id:args.branchId};
   const b=await projectRead(client,'getProjectBranch',{path});
   if(b?.branch?.project_id!==scope.projectId||b.branch.id!==args.branchId)
    throw Error('Neon branch identity mismatch');
   const [endpoints,databases,roles]=await Promise.all([
    projectRead(client,'listProjectBranchEndpoints',{path}),
    projectRead(client,'listProjectBranchDatabases',{path}),
    projectRead(client,'listProjectBranchRoles',{path})
   ]);
   if(!Array.isArray(endpoints?.endpoints)||!Array.isArray(databases?.databases)||
      !Array.isArray(roles?.roles)||endpoints.endpoints.some(e=>
       e.project_id!==scope.projectId||e.branch_id!==args.branchId)||
      databases.databases.some(d=>d.branch_id!==args.branchId)||
      roles.roles.some(role=>role.branch_id!==args.branchId))
    throw Error('Neon branch resources could not be verified');
   return readText({
    branch:branchSummary(b.branch),computes:endpoints.endpoints.map(computeSummary),
    databases:databases.databases.map(d=>({name:d.name,owner:d.owner_name})),
    roles:roles.roles.map(role=>({name:role.name,protected:role.protected===true})),
    logicalSizeBytes:b.branch.logical_size??null
   });
  }
 };
}
export const handlers=createBranchReadHandlers();
