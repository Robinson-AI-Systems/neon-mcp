// D-4: independently bound connection metadata and owner-only one-time URI handoff.
// Provider URIs are never returned, logged or included in B-1 audit.
import {projectScope,projectClient,projectRead} from './project-context.js';
import {readId,defineReadTool,readText} from './read-descriptors.js';
import {roleName,roleSchema,checkSecretStorage,schema,writeTarget} from './role-write-shared.js';
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runAuthorizedSqlRead} from '../neon/sql-read.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';

const name=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(x);
const id=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const host=x=>typeof x==='string'&&/^[A-Za-z0-9.-]{4,255}$/.test(x)&&
 x.includes('.')&&!x.includes('..');
const bool={type:'boolean'};
const choice={projectId:readId,branchId:readId,endpointId:readId,
 databaseName:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'},
 roleName:roleSchema};
async function target(a,c,getClient){
 const scope=projectScope(c,a.projectId??null);
 const pid=scope.projectId,bid=a.branchId;
 if(!id(pid)||!id(bid)||!id(a.endpointId)||
    !name(a.databaseName)||!roleName(a.roleName))
  throw Error('Select exact project, branch, compute, database and role');
 const client=typeof c.clientFor==='function'?await c.clientFor(pid):
  (await getClient(c,pid)).client;
 const path={project_id:pid,branch_id:bid};
 const [p,b,e,d,role]=await Promise.all([
  projectRead(client,'getProject',{path:{project_id:pid}}),
  projectRead(client,'getProjectBranch',{path}),
  projectRead(client,'getProjectEndpoint',{path:{project_id:pid,endpoint_id:a.endpointId}}),
  projectRead(client,'getProjectBranchDatabase',{
   path:{...path,database_name:a.databaseName}}),
  projectRead(client,'getProjectBranchRole',{
   path:{...path,role_name:a.roleName}})
 ]);
 if(p?.project?.id!==pid||p.project.org_id!==scope.org||
    b?.branch?.id!==bid||b.branch.project_id!==pid||
    e?.endpoint?.id!==a.endpointId||e.endpoint.project_id!==pid||
    e.endpoint.branch_id!==bid||!host(e.endpoint.host)||
    d?.database?.branch_id!==bid||d.database.name!==a.databaseName||
    !name(d.database.owner_name)||role?.role?.branch_id!==bid||
    role.role.name!==a.roleName)
  throw Error('Connection target identities are not independently verified');
 return {pid,bid,client,org:scope.org,endpoint:e.endpoint,
  database:a.databaseName,role:a.roleName,endpointId:a.endpointId,
  ...writeTarget({pid,bid})};
}
function validateUri(uri,t,{pooled=false,needPassword=false}={}){
 if(typeof uri!=='string'||uri.length>8192)
  throw Error('A matching Neon connection URI is unavailable');
 let parsed;
 try{parsed=new URL(uri);}catch{throw Error('Neon connection URI is invalid');}
 const expected=pooled?t.endpoint.host.replace(/^([^.]+)/,'$1-pooler'):
  t.endpoint.host;
 const ssl=parsed.searchParams.get('sslmode');
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||
    parsed.hostname.toLowerCase()!==expected.toLowerCase()||
    decodeURIComponent(parsed.username)!==t.role||
    decodeURIComponent(parsed.pathname.slice(1))!==t.database||
    !['require','verify-ca','verify-full'].includes(ssl)||
    (needPassword&&!parsed.password))
  throw Error('Neon URI does not match the verified direct or pooler target and TLS policy');
 return {host:parsed.hostname.toLowerCase(),sslMode:ssl};
}
async function uriFor(t,pooled=false){
 const result=await projectRead(t.client,'getConnectionUri',{
  path:{project_id:t.pid},query:{branch_id:t.bid,endpoint_id:t.endpointId,
   database_name:t.database,role_name:t.role,pooled}});
 const safe=validateUri(result?.uri,t,{pooled,needPassword:false});
 return {safe,uri:result.uri};
}
async function guardedConnectionTest(t,c){
 // An explicitly requested live test uses the same B-3 AST, protected resource,
 // stored owner read switch and read-only transaction as every other SQL read.
 const trusted=await createProjectWriteContext({
  connection:c.connection,db:c.db,env:c.env});
 const run=createSqlLayer({db:trusted.db,
  vault:createKeyVault({db:trusted.db,env:trusted.env}),env:trusted.env});
 const data=await runAuthorizedSqlRead({ctx:trusted,target:{
  projectId:t.pid,branchId:t.bid,database:t.database,role:t.role,
  endpointId:t.endpointId,expectedEndpointHost:t.endpoint.host,pooled:false},
 text:'SELECT 1 AS connectivity_check',sqlLayer:run});
 return data?.done===true&&data.rows?.length===1&&
  Number(data.rows[0].connectivity_check)===1
  ?{verified:true}:{verified:false,reason:data?.code??'verification_failed'};
}
const reveal=defineWrite({name:'neon_connection_show_once',
 secret:true,access:true,productionEffect:'write',
 plan:async(a,c)=>{
  checkSecretStorage(c);
  const t=await target(a,c,projectClient);
  if(t.endpoint.disabled===true)
   throw Error('Cannot issue a URI for a disabled compute');
  return {...writeTarget(t),before:{id:t.endpointId},
   summary:'Generate an expiring owner-only connection URI for database '+
    t.database+' with role '+t.role+' on compute '+t.endpointId+
    '; credential must be kept out of chats, logs, and repositories'};
 },
 apply:async(a,c)=>{
  const t=await target(a,c,projectClient);
  if(t.endpoint.disabled===true)
   return {confirmed:false};
  const {uri}=await uriFor(t,false);
  validateUri(uri,t,{needPassword:true});
  const stored=await checkSecretStorage(c).putOneTimeSecret({
   org:t.org,kind:'connection_uri',
   label:'Connection '+t.database+' / '+t.role,secret:uri});
  c.connectionOnceLink=stored.link;
  return {confirmed:true,operations:[]};
 },
 readAfter:async(_a,c)=>({delivered:typeof c.connectionOnceLink==='string'}),
 verify:(_before,after)=>after?.delivered===true
});
export const tools=[
 defineReadTool('neon_connection_get_info',
  'Verify connection target and return safe host, SSL and environment-variable snippets, never a URI.',
  {...choice,test:bool},{area:'connections'}),
 {...reveal.tool,profiles:['full'],secretRoute:'/api/neon/setup',
  oneTimeOnly:true,area:'connections',audience:['owner'],
  description:'After guarded owner confirmation, securely deliver a direct URI on an expiring one-time page.',
  inputSchema:schema({...choice},['branchId','endpointId','databaseName','roleName'])}
];
export function createConnectionHandlers({
 getClient=projectClient,contextFor=createProjectWriteContext,
 testConnection=guardedConnectionTest}={}){
 return {
  async neon_connection_get_info(a,c){
   const t=await target(a,c,getClient);
   const direct=await uriFor(t,false);
   let pooledHost=null;
   if(t.endpoint.pooler_enabled===true){
    const pooled=await uriFor(t,true);
    pooledHost=pooled.safe.host;
   }
   const result={projectId:t.pid,branchId:t.bid,endpointId:t.endpointId,
    host:direct.safe.host,pooledHost,sslMode:direct.safe.sslMode,
    database:t.database,role:t.role,privilegesVerified:false,
    snippets:{shell:'read -rsp "DATABASE_URL: " DATABASE_URL && export DATABASE_URL',
     psql:'psql "$DATABASE_URL"',node:'process.env.DATABASE_URL',
     prisma:'url = env("DATABASE_URL")'},
    testPerformed:a.test===true};
   if(a.test===true){
    const tested=await testConnection(t,c);
    result.connectionTest={verified:tested?.verified===true,
     ...(tested?.verified!==true?{reason:String(tested?.reason||'verification_failed')
      .slice(0,64)}:{})};
   }
   return readText(result);
  },
  async neon_connection_show_once(a,c){
   const trusted=await contextFor(c);
   const result=await reveal.handler(a,trusted);
   const parsed=JSON.parse(result.content[0].text);
   if(parsed.confirmed===true&&trusted.connectionOnceLink)
    result.content[0].text=JSON.stringify({...parsed,
     oneTimeSecretLink:trusted.connectionOnceLink});
   return result;
  }
 };
}
export const handlers=createConnectionHandlers();
