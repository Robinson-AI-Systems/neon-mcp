// D-4: provider-verified role identity and safe owner one-time password delivery.
import {projectScope,projectRead} from './project-context.js';
import {createOneTimeSecrets} from '../core/one-time.js';
import {encryptSecret} from '../core/crypto.js';
import {publicOrigin} from '../core/http.js';

export const roleName=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(x);
const validId=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
export const idSchema={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
export const roleSchema={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,62}$'};
export const common={projectId:idSchema,branchId:idSchema,confirm:{type:'boolean'},
 dryRun:{type:'boolean'},requestKey:{type:'string',minLength:8,maxLength:128},
 outsideApp:{type:'boolean'}};
export const schema=(more,required)=>({type:'object',properties:{...common,...more},
 required,additionalProperties:false});
export function checkSecretStorage(c){
 // A second owner-profile gate protects direct handler calls, even if discovery or
 // dispatch metadata is accidentally bypassed.
 if(c?.connection?.profile!=='full')throw Error('Owner profile required for secret delivery');
 // Fail before any mutation: public URL, durable encrypted exchange and a usable key.
 if(typeof c?.db?.saveOneTimeSecret!=='function'||
    typeof c?.db?.consumeSecretRequest!=='function')
  throw Error('Owner secret exchange is unavailable');
 publicOrigin(c.env);
 encryptSecret('npg_FAKE_preflight',{env:c.env,context:'preflight'});
 return createOneTimeSecrets({db:c.db,env:c.env});
}
export async function roleBranch(a,c){
 const {projectId:pid,org}=projectScope({connection:c.connection},a.projectId??null);
 if(!validId(pid)||!validId(a.branchId))throw Error('Valid scoped project and branch required');
 const path={project_id:pid,branch_id:a.branchId};
 const client=await c.clientFor(pid);
 const [p,b]=await Promise.all([
  projectRead(client,'getProject',{path:{project_id:pid}}),
  projectRead(client,'getProjectBranch',{path})]);
 if(p?.project?.id!==pid||p.project.org_id!==org||
    b?.branch?.id!==a.branchId||b.branch.project_id!==pid)
  throw Error('Role project and branch identity not verified');
 return {pid,bid:a.branchId,path,client};
}
export async function rolesOnBranch(t){
 const found=await projectRead(t.client,'listProjectBranchRoles',{path:t.path});
 if(!Array.isArray(found?.roles)||found.pagination?.cursor||
    found.roles.some(r=>r.branch_id!==t.bid||!roleName(r.name)))
  throw Error('Complete role inventory cannot be verified');
 return found.roles;
}
export async function existingRole(a,c){
 if(!roleName(a.roleName))throw Error('Choose a valid Postgres role');
 const t=await roleBranch(a,c);
 const data=await projectRead(t.client,'getProjectBranchRole',{
  path:{...t.path,role_name:a.roleName}});
 if(data?.role?.name!==a.roleName||data.role.branch_id!==t.bid||
    data.role.protected===true)
  throw Error('Role identity unverified or protected');
 return {...t,role:data.role};
}
export const writeTarget=t=>({target:'branch:'+t.bid,projectId:t.pid,branchId:t.bid});
