// D-4: only claim read-only creation when PostgreSQL proves current and future grants.
// Branch, endpoint, database and owner are verified independently of user input.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {call} from '../neon/client.js';
import {waitForOperations} from '../neon/operations.js';
import {runGuardedRoleGrants,assertRoleSqlAdmission} from '../neon/sql-run.js';
import {projectRead} from './project-context.js';
import {roleName,roleBranch,rolesOnBranch,checkSecretStorage,
 writeTarget,roleSchema,idSchema,schema} from './role-write-shared.js';

const named = x => typeof x === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(x);
const host = x => typeof x === 'string' && /^[A-Za-z0-9.-]{4,255}$/.test(x) &&
  x.includes('.') && !x.includes('..');
const schemasValid = a => Array.isArray(a.schemas) &&
  a.schemas.length > 0 && a.schemas.length <= 8 &&
  new Set(a.schemas).size === a.schemas.length &&
  a.schemas.every(s => roleName(s) && !s.startsWith('pg_') &&
    s !== 'information_schema' && s !== 'pg_catalog');

async function verifiedTarget(a,c) {
  if (!roleName(a.name) || !roleName(a.ownerName) || a.name === a.ownerName ||
      !named(a.databaseName) || !schemasValid(a))
    throw Error('Select a new role, distinct verified owner, database and safe schemas');
  const t = await roleBranch(a,c);
  if (!/^[a-z0-9-]{1,60}$/.test(a.endpointId || ''))
    throw Error('Select a verified direct compute');
  const [database,endpoint,owner] = await Promise.all([
    projectRead(t.client,'getProjectBranchDatabase',{
      path:{...t.path,database_name:a.databaseName}}),
    projectRead(t.client,'getProjectEndpoint',{
      path:{project_id:t.pid,endpoint_id:a.endpointId}}),
    projectRead(t.client,'getProjectBranchRole',{
      path:{...t.path,role_name:a.ownerName}})
  ]);
  if (database?.database?.name !== a.databaseName ||
      database.database.branch_id !== t.bid ||
      database.database.owner_name !== a.ownerName ||
      endpoint?.endpoint?.id !== a.endpointId ||
      endpoint.endpoint.project_id !== t.pid ||
      endpoint.endpoint.branch_id !== t.bid ||
      !host(endpoint.endpoint.host) || endpoint.endpoint.disabled === true ||
      endpoint.endpoint.type !== 'read_write' ||
      endpoint.endpoint.current_state !== 'active' ||
      owner?.role?.name !== a.ownerName || owner.role.branch_id !== t.bid)
    throw Error('Read-only grant database, owner or direct endpoint unverified');
  return {...t,endpointHost:endpoint.endpoint.host};
}
async function grantThroughScopedSql(a,c,t) {
  return runGuardedRoleGrants(a,c,t);
}
const define = defineWrite({name:'neon_role_create_read_only',secret:true,access:true,
 plan:async(a,c)=>{
  checkSecretStorage(c);
  const t = await verifiedTarget(a,c);
  const all = await rolesOnBranch(t);
  if (all.some(r=>r.name===a.name))
    throw Error('A role with this name already exists');
  return {...writeTarget(t),before:{name:a.name},
    summary:'Create role '+a.name+' and verify SELECT on '+a.schemas.join(', ')+
      ' in database '+a.databaseName+'; future-table defaults apply only to verified owner '+
      a.ownerName+'. Changes in other databases or by other creators are not covered'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const t=await verifiedTarget(a,c);
  await c.assertRoleGrantAdmission({ctx:c,target:t,args:a});
  if ((await rolesOnBranch(t)).some(r=>r.name===a.name))
    return {confirmed:false};
  const reply=await call(t.client,'createProjectBranchRole',{
    path:t.path,body:{role:{name:a.name}}
  },{write:true,requestKey:key});
  if(reply.error)return {confirmed:reply.confirmed===null?'pending':false};
  const created=reply.data?.role;
  if(created?.name!==a.name||created.branch_id!==t.bid||
      typeof created.password!=='string'||!created.password)
    return {confirmed:'pending'};
  if(reply.operations?.length){
    const done=await waitForOperations(t.client,t.pid,reply.operations,{budgetMs:15000});
    if(done.confirmed!==true)return {confirmed:'pending',operations:done.operations};
  }
  const secret=await checkSecretStorage(c).putOneTimeSecret({
    org:c.connection.neonOrg,kind:'role_password',
    label:'Scoped read-only role '+a.name,secret:created.password});
  // A role that was created but could not be granted MUST NOT be reported as
  // read-only; the B-1 claim remains pending and cannot blindly replay.
  const evidence=await c.applyReadOnlyGrants(a,c,t);
  if(evidence?.verified!==true||evidence.role!==a.name||
      evidence.owner!==a.ownerName||
      JSON.stringify(evidence.schemas)!==JSON.stringify(a.schemas) ||
      evidence.futureTablesForOwnerVerified!==true)
    return {confirmed:'pending'};
  c.roleReadOnlyEvidence=evidence;
  c.roleSecretLink=secret.link;
  return {confirmed:true,operations:reply.operations||[]};
 },
 readAfter:async(a,c)=>{
  const t=await roleBranch(a,c);
  return (await projectRead(t.client,'getProjectBranchRole',{
    path:{...t.path,role_name:a.name}}))?.role;
 },
 verify:(_before,after,a,c)=>after?.name===a.name&&
  after.branch_id===a.branchId&&after.protected===false&&
  c.roleReadOnlyEvidence?.verified===true
});
export const tools=[{...define.tool,profiles:['full'],area:'roles',
  audience:['owner'],secretRoute:'/api/neon/setup',oneTimeOnly:true,
  description:'Create a login role with independently verified SELECT grants and future defaults in chosen database schemas; owner-only password handoff.',
  inputSchema:schema({
    name:roleSchema,ownerName:roleSchema,
    databaseName:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'},
    endpointId:idSchema,
    schemas:{type:'array',minItems:1,maxItems:8,
      items:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,62}$'}}
  },['branchId','name','ownerName','databaseName','endpointId','schemas'])
}];
export function createReadOnlyRoleHandlers({
  contextFor=createProjectWriteContext,grant=grantThroughScopedSql,
  admission=assertRoleSqlAdmission
}={}){
  return {neon_role_create_read_only:async(a,ctx)=>{
    const trusted=await contextFor(ctx);
    trusted.applyReadOnlyGrants=grant;
    trusted.assertRoleGrantAdmission=admission;
    const result=await define.handler(a,trusted);
    const parsed=JSON.parse(result.content[0].text);
    if(parsed.confirmed===true&&trusted.roleSecretLink)
      result.content[0].text=JSON.stringify({...parsed,
        oneTimeSecretLink:trusted.roleSecretLink});
    return result;
  }};
}
export const handlers=createReadOnlyRoleHandlers();
