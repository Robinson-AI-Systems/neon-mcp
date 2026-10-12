// D-2 branch reads: org-bound project and branch identity, bounded and allowlisted output.
import {projectScope,projectClient,projectRead,projectPages,branchSummary,computeSummary} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';

export const tools=[
 defineReadTool('neon_branch_list','List bounded branches with safe default, protection and parent summaries.',{
  projectId:readId,limit:{type:'integer',minimum:1,maximum:100}}),
 defineReadTool('neon_branch_get','Inspect a branch, computes, databases and roles without credentials.',{
  projectId:readId,branchId:readId}),
 defineReadTool('neon_branch_compare_schema','Compare two branch database schemas as a bounded readable diff.',{
  projectId:readId,branchId:readId,baseBranchId:readId,
  database:{type:'string',minLength:1,maxLength:63},
  lsn:{type:'string',pattern:'^[0-9a-fA-F]+/[0-9a-fA-F]+$'},
  timestamp:{type:'string',format:'date-time'},
  baseLsn:{type:'string',pattern:'^[0-9a-fA-F]+/[0-9a-fA-F]+$'},
  baseTimestamp:{type:'string',format:'date-time'}})
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
  async neon_branch_compare_schema(args,ctx){
   // Provider history selectors are mutually exclusive per side; malformed
   // or future references fail before any provider request.
   const history=(lsn,timestamp)=>{
    if(lsn!==undefined&&timestamp!==undefined)
     throw Error('Choose one history locator per branch');
    if(lsn!==undefined&&(typeof lsn!=='string'||!/^[0-9a-f]+\/[0-9a-f]+$/i.test(lsn)))
     throw Error('Invalid schema history LSN');
    if(timestamp!==undefined&&(typeof timestamp!=='string'||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(timestamp)||
       !Number.isFinite(Date.parse(timestamp))||Date.parse(timestamp)>Date.now()))
     throw Error('Schema history timestamp must be valid past UTC');
   };
   history(args.lsn,args.timestamp);
   history(args.baseLsn,args.baseTimestamp);
   if(!/^[a-z0-9-]{1,60}$/.test(args.branchId||'')||
      !/^[a-z0-9-]{1,60}$/.test(args.baseBranchId||'')||
      typeof args.database!=='string'||! /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(args.database))
    throw Error('Select two branches and a valid database');
   const {client,scope}=await verifiedClient(args,ctx,getClient);
   const readBranch=async id=>{
    const data=await projectRead(client,'getProjectBranch',{path:{
     project_id:scope.projectId,branch_id:id}});
    if(data?.branch?.id!==id||data.branch.project_id!==scope.projectId)
     throw Error('Branch identity mismatch');
   };
   await readBranch(args.branchId);
   if(args.branchId!==args.baseBranchId)await readBranch(args.baseBranchId);
   const data=await projectRead(client,'getProjectBranchSchemaComparison',{
    path:{project_id:scope.projectId,branch_id:args.branchId},
    query:{base_branch_id:args.baseBranchId,db_name:args.database,
     ...(args.lsn?{lsn:args.lsn}:{}),
     ...(args.timestamp?{timestamp:args.timestamp}:{}),
     ...(args.baseLsn?{base_lsn:args.baseLsn}:{}),
     ...(args.baseTimestamp?{base_timestamp:args.baseTimestamp}:{})}});
   if(typeof data?.diff!=='string')throw Error('Neon returned no schema diff');
   return readText({projectId:scope.projectId,branchId:args.branchId,
    baseBranchId:args.baseBranchId,database:args.database,
    ...(args.lsn?{lsn:args.lsn}:{}),...(args.timestamp?{timestamp:args.timestamp}:{}),
    ...(args.baseLsn?{baseLsn:args.baseLsn}:{}),
    ...(args.baseTimestamp?{baseTimestamp:args.baseTimestamp}:{}),
    changed:data.diff.trim().length>0,diff:data.diff});
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
