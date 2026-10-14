// D-6 owner-confirmed, development-only extension install/upgrade.
// Provider metadata and actual post-write catalog readback are mandatory.
// This is deliberately not a generic SQL DDL escape hatch.
import {defineWrite} from '../core/write.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery,runReviewedExtensionMutation,safeExtensionNames}
 from '../neon/sql-run.js';
import {EXTENSIONS_SQL} from './schema-reads.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const name={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const allowed=new Set(safeExtensionNames);
const verifiedRows=x=>x?.done===true&&x.truncated===false&&
 x.cellsCapped!==true&&x.columnsCapped!==true&&Array.isArray(x.rows)&&
 x.rowCount===x.rows.length&&x.rows.length<=200;
function version(x){return typeof x==='string'&&/^[A-Za-z0-9.+_-]{1,80}$/.test(x);}
export function createExtensionWriteHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 query=runPublicSqlQuery,mutate=runReviewedExtensionMutation
}={}){
 async function observe(a,c){
  if(c?.connection?.profile!=='full'||c.connection.mode!=='preview'||
     !allowed.has(a?.extensionName)||typeof a.update!=='boolean')
   throw Error('Full owner on a development branch must select an audited extension');
  const v=await verifyTarget(a,c);
  if(v?.pid!==a.projectId||v?.bid!==a.branchId||
     v.endpointId!==a.endpointId||v.database!==a.databaseName||
     v.role!==a.roleName||typeof v.endpoint?.host!=='string')
   throw Error('Selected extension database identity could not be verified');
  const target={projectId:v.pid,branchId:v.bid,endpointId:v.endpointId,
   expectedEndpointHost:v.endpoint.host,database:v.database,
   role:v.role,pooled:false};
  const observed=await query({ctx:c,target,text:EXTENSIONS_SQL});
  if(!verifiedRows(observed))throw Error('Complete extension inventory required');
  const rows=observed.rows.filter(x=>x.extension_name===a.extensionName);
  if(rows.length!==1||!version(rows[0].default_version)||
      rows[0].installed_version!==null&&!version(rows[0].installed_version))
   throw Error('Selected extension catalog is incomplete');
  return {target,installedVersion:rows[0].installed_version,
   availableVersion:rows[0].default_version};
 }
 async function planned(a,c){
  const result=await observe(a,c);
  if(a.update){
   if(!result.installedVersion||
      result.installedVersion===result.availableVersion)
    throw Error('Only a verified available extension upgrade can be applied');
  }else if(result.installedVersion!==null)
   throw Error('Extension is already installed; use update only if a newer version exists');
  return result;
 }
 const mutation=defineWrite({
  name:'neon_schema_enable_extension',destructive:true,access:true,
  plan:async(a,c)=>{
   const before=await planned(a,c);
   return {projectId:before.target.projectId,branchId:before.target.branchId,
    target:'schema-extension:'+before.target.projectId+'/'+
      before.target.branchId+'/'+before.target.database+'/'+a.extensionName,
    before,summary:(a.update?'Update ':'Install ')+'audited extension '+
     a.extensionName+' in development database '+before.target.database+
     ' on branch '+before.target.branchId+
     '. This runs PostgreSQL DDL, may require elevated permissions and incur compute/storage usage. Never runs on a protected, application-owned or production branch.'};
  },
  apply:async(a,c,{before})=>{
   // Re-read both provider identity and catalog version after the owner confirms.
   const fresh=await planned(a,c);
   if(JSON.stringify(fresh)!==JSON.stringify(before))
    throw Error('Extension or target changed after owner preview');
   const result=await mutate({ctx:c,target:fresh.target,
    name:a.extensionName,update:a.update});
   return {confirmed:result?.issued===true?'pending':'pending'};
  },
  readAfter:async(a,c)=>observe(a,c),
  verify:async(before,after)=>JSON.stringify(before.target)===
    JSON.stringify(after.target)&&
    after.installedVersion===before.availableVersion
 });
 const tool={...mutation.tool,profiles:['full'],area:'schema',audience:['owner'],
  description:'Owner-confirmed, development-only install or upgrade of six audited PostgreSQL extensions; exact catalog checks and independent result readback, never generic SQL.',
  inputSchema:{type:'object',properties:{
   projectId:id,branchId:id,endpointId:id,databaseName:name,roleName:name,
   extensionName:{type:'string',enum:safeExtensionNames},update:{type:'boolean'},
   outsideApp:{type:'boolean'},dryRun:{type:'boolean'},confirm:{type:'boolean'},
   requestKey:{type:'string',minLength:8,maxLength:128}
  },required:['projectId','branchId','endpointId','databaseName',
   'roleName','extensionName','update'],additionalProperties:false}};
 return {tools:[tool],handlers:{async neon_schema_enable_extension(a,connectionCtx){
  const ctx=await contextFor(connectionCtx);
  return mutation.handler(a,ctx);
 }}};
}
const built=createExtensionWriteHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
