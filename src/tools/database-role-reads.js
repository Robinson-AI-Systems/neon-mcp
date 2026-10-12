// D-4: credential-free bounded database and role discovery, scoped to a verified branch.
import {projectScope,projectClient,projectRead} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';

const nameSchema={type:'string',minLength:1,maxLength:63,pattern:'^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$'};
const validName=x=>typeof x==='string'&&/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(x);
const validId=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const limit={type:'integer',minimum:1,maximum:100};
export const tools=[
 defineReadTool('neon_database_list','List safe names and owners of databases on a verified branch.',{
  projectId:readId,branchId:readId,limit},{area:'databases'}),
 defineReadTool('neon_database_get','Get one verified database and its owner without credentials.',{
  projectId:readId,branchId:readId,databaseName:nameSchema},{area:'databases'}),
 defineReadTool('neon_role_list','List verified Postgres role names and protected status, never passwords.',{
  projectId:readId,branchId:readId,limit},{area:'roles'}),
 defineReadTool('neon_role_get','Get verified role details; SQL privileges are not inferred from API metadata.',{
  projectId:readId,branchId:readId,roleName:nameSchema},{area:'roles'})
];
const safeDatabase=d=>({id:d.id,name:d.name,owner:d.owner_name,
 createdAt:d.created_at??null,updatedAt:d.updated_at??null});
const safeRole=r=>({name:r.name,protected:r.protected===true,
 createdAt:r.created_at??null,updatedAt:r.updated_at??null,
 privilegesVerified:false,privileges:null});
async function verifiedBranch(a,c,getClient){
 const scope=projectScope(c,a.projectId??null);
 if(!scope.projectId||!validId(a.branchId))
  throw Error('Choose a project and valid branch ID');
 const {client}=await getClient(c,scope.projectId);
 const path={project_id:scope.projectId,branch_id:a.branchId};
 const [p,b]=await Promise.all([
  projectRead(client,'getProject',{path:{project_id:scope.projectId}}),
  projectRead(client,'getProjectBranch',{path})
 ]);
 if(p?.project?.id!==scope.projectId||p.project.org_id!==scope.org||
    b?.branch?.id!==a.branchId||b.branch.project_id!==scope.projectId)
  throw Error('Database or role branch identity cannot be verified');
 return {client,path,scope};
}
function listResult(data,key,branchId,select,max){
 const entries=data?.[key];
 if(!Array.isArray(entries)||entries.some(x=>x.branch_id!==branchId||
    !validName(x.name)|| (key==='databases'&&!validName(x.owner_name))))
  throw Error('Complete scoped database or role inventory is unavailable');
 return {items:entries.slice(0,max).map(select),returned:Math.min(entries.length,max),
  capped:entries.length>max};
}
export function createDatabaseRoleReadHandlers({getClient=projectClient}={}){
 return {
  async neon_database_list(a,c){
   const {client,path,scope}=await verifiedBranch(a,c,getClient);
   const result=listResult(await projectRead(client,'listProjectBranchDatabases',{path}),
    'databases',a.branchId,safeDatabase,a.limit??50);
   return readText({projectId:scope.projectId,branchId:a.branchId,
    databases:result.items,returned:result.returned,capped:result.capped});
  },
  async neon_database_get(a,c){
   if(!validName(a.databaseName))throw Error('Valid database name required');
   const {client,path,scope}=await verifiedBranch(a,c,getClient);
   const data=await projectRead(client,'getProjectBranchDatabase',{
    path:{...path,database_name:a.databaseName}});
   const d=data?.database;
   if(d?.branch_id!==a.branchId||d.name!==a.databaseName||
      !validName(d.owner_name))
    throw Error('Database identity and owner cannot be verified');
   return readText({projectId:scope.projectId,branchId:a.branchId,
    database:safeDatabase(d)});
  },
  async neon_role_list(a,c){
   const {client,path,scope}=await verifiedBranch(a,c,getClient);
   const result=listResult(await projectRead(client,'listProjectBranchRoles',{path}),
    'roles',a.branchId,safeRole,a.limit??50);
   return readText({projectId:scope.projectId,branchId:a.branchId,
    roles:result.items,returned:result.returned,capped:result.capped});
  },
  async neon_role_get(a,c){
   if(!validName(a.roleName))throw Error('Valid role name required');
   const {client,path,scope}=await verifiedBranch(a,c,getClient);
   const data=await projectRead(client,'getProjectBranchRole',{
    path:{...path,role_name:a.roleName}});
   const role=data?.role;
   if(role?.branch_id!==a.branchId||role.name!==a.roleName)
    throw Error('Postgres role identity cannot be verified');
   return readText({projectId:scope.projectId,branchId:a.branchId,
    role:safeRole(role)});
  }
 };
}
export const handlers=createDatabaseRoleReadHandlers();
