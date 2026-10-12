// D-4: guarded password rotation. Raw Neon passwords never enter a result or audit.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {call} from '../neon/client.js';
import {waitForOperations} from '../neon/operations.js';
import {projectRead} from './project-context.js';
import {existingRole,roleBranch,checkSecretStorage,writeTarget,
 roleSchema,schema} from './role-write-shared.js';

const reset=defineWrite({name:'neon_role_reset_password',secret:true,access:true,
 plan:async(a,c)=>{
  checkSecretStorage(c); // storage, encryption and trusted HTTPS URL before mutation
  const t=await existingRole(a,c);
  if(typeof t.role.updated_at!=='string'||!t.role.updated_at)
   throw Error('Role revision is not independently available');
  return {...writeTarget(t),before:{name:t.role.name,updatedAt:t.role.updated_at},
   summary:'RESET login password for role '+t.role.name+' on branch '+t.bid+
    '; existing apps and connection strings using this role will stop working when Neon applies it. '+
    'Update every dependent configuration; individual consumers are not independently enumerated'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const t=await existingRole(a,c);
  const reply=await call(t.client,'resetProjectBranchRolePassword',{
   path:{...t.path,role_name:a.roleName}
  },{write:true,requestKey:key});
  if(reply.error)return {confirmed:reply.confirmed===null?'pending':false};
  const role=reply.data?.role;
  if(role?.branch_id!==t.bid||role.name!==a.roleName||
     typeof role.password!=='string'||!role.password)
   return {confirmed:'pending'};
  const secret=await checkSecretStorage(c).putOneTimeSecret({
   org:c.connection.neonOrg,kind:'role_password',
   label:'Rotated role '+a.roleName,secret:role.password});
  c.roleSecretLink=secret.link;
  if(reply.operations?.length){
   const done=await waitForOperations(t.client,t.pid,reply.operations,{budgetMs:15000});
   return {confirmed:done.confirmed===true?true:'pending',operations:done.operations};
  }
  return {confirmed:true,operations:[]};
 },
 readAfter:async(a,c)=>{
  const t=await roleBranch(a,c);
  return (await projectRead(t.client,'getProjectBranchRole',{
   path:{...t.path,role_name:a.roleName}}))?.role;
 },
 verify:(before,after,a)=>after?.name===a.roleName&&
  after.branch_id===a.branchId&&after.protected===false&&
  typeof after.updated_at==='string'&&
  Date.parse(after.updated_at)>Date.parse(before.updatedAt)
});
export const tools=[{...reset.tool,profiles:['full'],
 description:'Rotate an existing role password after confirming affected connections; encrypted owner-only delivery.',
 secretRoute:'/api/neon/setup',oneTimeOnly:true,area:'roles',audience:['owner'],
 inputSchema:schema({roleName:roleSchema},['branchId','roleName'])}];
export function createRoleResetHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_role_reset_password:async(args,ctx)=>{
  const trusted=await contextFor(ctx);
  const result=await reset.handler(args,trusted);
  const parsed=JSON.parse(result.content[0].text);
  if(parsed.confirmed===true&&trusted.roleSecretLink)
   result.content[0].text=JSON.stringify({...parsed,
    oneTimeSecretLink:trusted.roleSecretLink});
  return result;
 }};
}
export const handlers=createRoleResetHandlers();
