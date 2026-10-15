// V-4 owner/builder integration readiness: evidence only, no change tools.
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {verifyConnectionTarget} from './connections.js';
import {verifiedProject,allBranches} from './dev-runs.js';
import {projectRead} from './project-context.js';
import {runAuthorizedSqlRead} from '../neon/sql-read.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';
import {INTEGRATION_TABLES_SQL,INTEGRATION_EXTENSIONS_SQL,
 evaluateIntegration} from '../dev/integration-check.js';
import {PRISMA_SQL} from '../dev/migration-plan.js';
import {defineReadTool,readText} from './read-descriptors.js';
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const name={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,62}$'};
const list={type:'array',maxItems:12,items:name};
const schema={projectId:id,branchId:id,endpointId:id,databaseName:name,
 roleName:name,expectedTables:{type:'array',minItems:1,maxItems:12,items:{
  type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,62}\\.[A-Za-z_][A-Za-z0-9_]{0,62}$'}},
 expectedExtensions:list,expectedRoles:list,
 latestMigration:{type:'string',pattern:'^[A-Za-z0-9_-]{1,128}$'},
 pooledHost:{type:'string',maxLength:255},
 requireAuth:{type:'boolean'},requireDataApi:{type:'boolean'}};
async function observed(a,c,verifyTarget,sqlFactory,reads){
 if(!['read_only','everyday','full'].includes(c.connection?.profile))
  throw Error('Authenticated scoped integration reader required');
 const matched=await verifyTarget(a,c);
 if(matched?.pid!==a.projectId||matched?.bid!==a.branchId||
    matched.endpointId!==a.endpointId||matched.database!==a.databaseName||
    matched.role!==a.roleName||typeof matched.endpoint?.host!=='string')
  throw Error('Independent database/endpoint identity not verified');
 const source=await verifiedProject(a,c),branches=await allBranches(source.client,a.projectId);
 const selected=branches.find(x=>x.id===a.branchId);
 const defaults=branches.filter(x=>x.default===true);
 if(!selected||defaults.length!==1||selected.project_id!==a.projectId)
  throw Error('Complete production/developer branch inventory required');
 const target={projectId:a.projectId,branchId:a.branchId,
  endpointId:a.endpointId,expectedEndpointHost:matched.endpoint.host,
  database:a.databaseName,role:a.roleName,pooled:false};
 const sqlRead=async(text,params=[])=>{
  const result=await runAuthorizedSqlRead({ctx:c,target,text,params,
   sqlLayer:sqlFactory(c)});
  return result?.done===true&&!result.truncated?result.rows:null;
 };
 const root={project_id:a.projectId,branch_id:a.branchId};
 const maybe=async(operationId,path=root)=>{
  try{return await projectRead(source.client,operationId,{path});}
  catch{return null;}
 };
 const postgres=reads?await reads({args:a,ctx:c,target}):{
  tables:await sqlRead(INTEGRATION_TABLES_SQL),
  extensions:await sqlRead(INTEGRATION_EXTENSIONS_SQL),
  migrations:await sqlRead(PRISMA_SQL('public'))};
 const providers=await Promise.all([
  maybe('listProjectBranchRoles',root),
  maybe('listProjectEndpoints',{project_id:a.projectId}),
  maybe('getNeonAuth',root),
  maybe('getProjectBranchDataAPI',{
   ...root,database_name:a.databaseName})
 ]);
 const [roles,endpoints,auth,dataApi]=providers;
 const project=source.project,owner=project.owner;
 const computed=Array.isArray(endpoints?.endpoints)&&
  endpoints.endpoints.every(x=>x.project_id===a.projectId)?
  endpoints.endpoints:null;
 const remaining=Number.isSafeInteger(owner?.computes_limit)&&computed?
  owner.computes_limit-computed.length:null;
 const tables=postgres?.tables,extensions=postgres?.extensions;
 const migrations=postgres?.migrations;
 return {tables,extensions,
  latestMigration:Array.isArray(migrations)&&migrations.length<=100?
   migrations.filter(x=>x.finished_at!==null).at(-1)?.migration_name??null:null,
  roles:Array.isArray(roles?.roles)&&roles.roles.every(x=>x.branch_id===a.branchId)?
   roles.roles:null,
  defaultBranchProtected:defaults[0].protected===true,
  devExpires:selected.default!==true&&selected.protected!==true&&
   Number.isFinite(Date.parse(selected.expires_at))&&
   Date.parse(selected.expires_at)>Date.now()+300000,
  authEnabled:auth?.branch_id===a.branchId&&
   ['better_auth','stack','mock'].includes(auth.auth_provider),
  dataApiEnabled:['ready','active'].includes(dataApi?.status),
  quota:{verified:Number.isSafeInteger(owner?.branches_limit)&&
   Number.isSafeInteger(remaining)&&computed!==null,
   branchRemaining:Number.isSafeInteger(owner?.branches_limit)?
    owner.branches_limit-branches.length:null,
   computeRemaining:remaining}};
}
export function createDevIntegrationHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env}),
 evidenceFor=null
}={}){
 const tool=defineReadTool('neon_dev_check_integration',
  'Check scoped app tables, migrations, roles, extensions, pooler, branch protections, auth, Data API and project quotas.',
  schema,{area:'developer',audience:['owner','builder','operator']});
 return {tools:[tool],handlers:{
  async neon_dev_check_integration(a,raw){
   const c=await contextFor(raw);
   const evidence=await observed(a,c,verifyTarget,sqlFactory,evidenceFor);
   const result=evaluateIntegration(a,evidence);
   return readText({projectId:a.projectId,branchId:a.branchId,
    ...result,mutation:false});
  }
 }};
}
const built=createDevIntegrationHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
