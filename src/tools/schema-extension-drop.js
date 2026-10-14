// D-6 confirmed development-only extension retirement. Never CASCADE.
import {defineWrite} from '../core/write.js';
import {classifyTarget} from '../neon/production.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery,runReviewedExtensionMutation,safeExtensionNames} from '../neon/sql-run.js';
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const allowed=new Set(safeExtensionNames);
export const EXTENSION_STATUS_SQL='SELECT e.oid::text AS extension_oid,'+
 ' e.extversion AS installed_version FROM pg_catalog.pg_extension e'+
 ' WHERE e.extname=$1 LIMIT 2';
export const EXTENSION_DEPENDENCIES_SQL=
 'WITH members AS (SELECT d.classid,d.objid FROM pg_catalog.pg_depend d'+
 ' JOIN pg_catalog.pg_extension e ON d.refclassid=\'pg_catalog.pg_extension\'::regclass'+
 " AND d.refobjid=e.oid WHERE e.extname=$1 AND d.deptype='e'),"+
 ' dependencies AS (SELECT DISTINCT d.classid,d.objid,d.objsubid'+
 ' FROM pg_catalog.pg_depend d JOIN members m ON d.refclassid=m.classid AND d.refobjid=m.objid'+
 " WHERE d.deptype='n' AND NOT EXISTS(SELECT 1 FROM members own"+
 ' WHERE own.classid=d.classid AND own.objid=d.objid) UNION'+
 ' SELECT d.classid,d.objid,d.objsubid FROM pg_catalog.pg_depend d'+
 ' JOIN pg_catalog.pg_extension e ON d.refclassid=\'pg_catalog.pg_extension\'::regclass'+
 " AND d.refobjid=e.oid WHERE e.extname=$1 AND d.deptype='x')"+
 ' SELECT pg_catalog.pg_describe_object(classid,objid,objsubid) AS dependent_object'+
 ' FROM dependencies ORDER BY classid,objid,objsubid LIMIT 201';
const whole=x=>x?.done===true&&x.truncated===false&&x.cellsCapped!==true&&
 x.columnsCapped!==true&&Array.isArray(x.rows)&&x.rowCount===x.rows.length&&x.rows.length<=200;
export function createExtensionDropHandlers({contextFor=createProjectWriteContext,
 verifyTarget=verifyConnectionTarget,query=runPublicSqlQuery,mutate=runReviewedExtensionMutation}={}){
 async function observe(a,c){
  if(c?.connection?.profile!=='full'||!allowed.has(a?.extensionName))throw Error('Full owner and audited extension required');
  const v=await verifyTarget(a,c);
  if(v.pid!==a.projectId||v.bid!==a.branchId||v.endpointId!==a.endpointId||
   v.database!==a.databaseName||v.role!==a.roleName||typeof v.endpoint?.host!=='string')
   throw Error('Extension target identity mismatch');
  const target={projectId:v.pid,branchId:v.bid,endpointId:v.endpointId,
   expectedEndpointHost:v.endpoint.host,database:v.database,role:v.role,pooled:false};
  const state=await query({ctx:c,target,text:EXTENSION_STATUS_SQL,params:[a.extensionName]});
  const deps=await query({ctx:c,target,text:EXTENSION_DEPENDENCIES_SQL,params:[a.extensionName]});
  if(!whole(state)||state.rows.length>1||!whole(deps)||deps.rows.some(x=>
   typeof x.dependent_object!=='string'||x.dependent_object.length<1||x.dependent_object.length>500))
   throw Error('Complete extension/dependency catalog required');
  const ext=state.rows[0];
  if(ext&&(!/^\d+$/.test(ext.extension_oid)||
   typeof ext.installed_version!=='string'||!/^[A-Za-z0-9.+_-]{1,80}$/.test(ext.installed_version)))
   throw Error('Invalid extension metadata');
  return {target,extension:ext??null,dependencies:deps.rows.map(x=>x.dependent_object)};
 }
 const write=defineWrite({name:'neon_schema_disable_extension',destructive:true,access:true,
  plan:async(a,c)=>{const before=await observe(a,c);
   return {projectId:before.target.projectId,branchId:before.target.branchId,
    target:'extension-drop:'+before.target.projectId+'/'+before.target.branchId+'/'+before.target.database+'/'+a.extensionName,
    before,summary:'Remove audited development extension '+a.extensionName+
     ' and its member objects using RESTRICT. '+before.dependencies.length+
     ' observed external dependencies; any dependency blocks removal. No CASCADE or production/app-owned changes.'};},
  apply:async(a,c,{before})=>{
   const fresh=await observe(a,c);
   if(JSON.stringify(fresh)!==JSON.stringify(before)||fresh.dependencies.length)
    throw Error('Dependencies or extension changed; new review required');
   const classification=await classifyTarget(c,fresh.target);
   if(!classification.allowed||classification.production||
    await c.guards.checkProtected(fresh.target,c)!==true||
    await c.guards.checkApp(fresh.target,c,{...a,outsideApp:false})!==true)
    throw Error('Extension target no longer eligible');
   if(!fresh.extension)return {confirmed:true};
   const result=await mutate({ctx:c,target:fresh.target,name:a.extensionName,remove:true});
   return {confirmed:result?.issued===true?true:'pending'};
  },readAfter:observe,verify:async(before,after)=>
   JSON.stringify(before.target)===JSON.stringify(after.target)&&after.extension===null&&after.dependencies.length===0});
 const tool={...write.tool,profiles:['full'],area:'schema',audience:['owner'],
  description:'Confirm development extension removal with dependency review and RESTRICT; never CASCADE.',
  inputSchema:{type:'object',properties:{projectId:id,branchId:id,endpointId:id,
   databaseName:ident,roleName:ident,extensionName:{type:'string',enum:safeExtensionNames},
   dryRun:{type:'boolean'},confirm:{type:'boolean'}},
   required:['projectId','branchId','endpointId','databaseName','roleName','extensionName'],additionalProperties:false}};
 return {tools:[tool],handlers:{async neon_schema_disable_extension(a,connectionCtx){
  const c=await contextFor(connectionCtx),result=await write.handler(a,c);
  // Only a nonmutating preview exposes bounded dependency descriptions.
  if(a.dryRun===true&&!result.isError){
   const state=await observe(a,c),value=JSON.parse(result.content[0].text);
   return {content:[{type:'text',text:JSON.stringify({...value,dependencies:state.dependencies,
    dependencyCoverage:'Direct observed catalog dependencies only. PostgreSQL RESTRICT independently enforces remaining dependencies at execution.'})}]};
  }
  return result;
 }}};
}
const built=createExtensionDropHandlers();export const tools=built.tools;export const handlers=built.handlers;
