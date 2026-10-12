// D-4: role create; no password ever enters the MCP result or durable write log.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {call} from '../neon/client.js';
import {waitForOperations} from '../neon/operations.js';
import {projectRead} from './project-context.js';
import {roleName,roleBranch,rolesOnBranch,checkSecretStorage,
 writeTarget,roleSchema,schema} from './role-write-shared.js';

const create=defineWrite({name:'neon_role_create',secret:true,access:true,
 plan:async(a,c)=>{
  if(!roleName(a.name))throw Error('Valid role name required');
  checkSecretStorage(c); // absolutely before external POST
  const t=await roleBranch(a,c),all=await rolesOnBranch(t);
  if(all.some(r=>r.name===a.name))throw Error('The role already exists');
  return {...writeTarget(t),before:{name:a.name},
   summary:'Create login role '+a.name+' on branch '+t.bid+
    '; credentials are delivered only to the owner one-time page'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const t=await roleBranch(a,c);
  const reply=await call(t.client,'createProjectBranchRole',{
   path:t.path,body:{role:{name:a.name}}
  },{write:true,requestKey:key});
  if(reply.error)return {confirmed:reply.confirmed===null?'pending':false};
  const created=reply.data?.role;
  if(created?.name!==a.name||created.branch_id!==t.bid||
     typeof created.password!=='string'||!created.password)
   return {confirmed:'pending'};
  // Store only encrypted password; never put provider response in B-1 audit.
  const secret=await checkSecretStorage(c).putOneTimeSecret({
   org:c.connection.neonOrg,kind:'role_password',label:'Role '+a.name,
   secret:created.password});
  c.roleSecretLink=secret.link;
  if(reply.operations?.length){
   const waited=await waitForOperations(t.client,t.pid,reply.operations,{budgetMs:15000});
   return {confirmed:waited.confirmed===true?true:'pending',operations:waited.operations};
  }
  return {confirmed:true,operations:[]};
 },
 readAfter:async(a,c)=>{
  const t=await roleBranch(a,c);
  return (await projectRead(t.client,'getProjectBranchRole',{
   path:{...t.path,role_name:a.name}}))?.role;
 },
 verify:(before,after,a)=>after?.name===before.name&&
  after.branch_id===a.branchId&&after.protected===false
});
export const tools=[{...create.tool,profiles:['full'],
 description:'Create a verified Postgres login role; deliver its password through the owner one-time page.',
 secretRoute:'/api/neon/setup',oneTimeOnly:true,area:'roles',
 audience:['owner'],inputSchema:schema({name:roleSchema},['branchId','name'])}];
export function createRoleCreateHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_role_create:async(args,ctx)=>{
  const trusted=await contextFor(ctx);
  const result=await create.handler(args,trusted);
  const parsed=JSON.parse(result.content[0].text);
  if(parsed.confirmed===true&&trusted.roleSecretLink)
   result.content[0].text=JSON.stringify({...parsed,
    oneTimeSecretLink:trusted.roleSecretLink});
  return result;
 }};
}
export const handlers=createRoleCreateHandlers();
