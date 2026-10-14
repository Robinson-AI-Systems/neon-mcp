// D-9 reviewed development-only concurrent index and table maintenance.
import {defineWrite} from '../core/write.js';
import {classifyTarget} from '../neon/production.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery,runReviewedReindexMutation} from '../neon/sql-run.js';
import {TABLES_SQL} from './schema-reads.js';
import {INDEX_INVENTORY_SQL} from './schema-index-write.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const valid=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(x);
const complete=x=>x?.done===true&&x.truncated===false&&
 x.cellsCapped!==true&&x.columnsCapped!==true&&Array.isArray(x.rows)&&
 x.rowCount===x.rows.length&&x.rows.length<=200;
function validIndex(i){
 return i&&/^\d+$/.test(i.index_oid)&&valid(i.index_name)&&valid(i.table_name)&&
 ['valid_index','ready_index','unique_index','primary_index','constraint_index','custom_expression']
  .every(k=>typeof i[k]==='boolean')&&typeof i.method==='string'&&i.method.length<=63&&
 Number.isInteger(i.key_count)&&i.key_count>=1&&Number.isInteger(i.attribute_count)&&
 i.attribute_count>=i.key_count&&i.attribute_count<=32&&
 /^\d+$/.test(i.index_bytes)&&(i.scans===null||/^\d+$/.test(i.scans))&&
 Array.isArray(i.columns)&&i.columns.length===i.attribute_count&&
 i.columns.every(x=>x===null||valid(x));
}
function stable(i){
 // REINDEX CONCURRENTLY may replace OIDs, sizes and usage counters. Those
 // fields are diagnostic evidence, never part of the logical identity.
 const {index_oid,index_bytes,scans,...shape}=i;
 return shape;
}
function signature(snapshot){
 return {target:snapshot.target,indexes:snapshot.indexes.map(stable)};
}
function publicObservation(snapshot){
 return {scope:snapshot.scope,table:snapshot.table,indexes:snapshot.indexes.map(i=>({
  name:i.index_name,valid:i.valid_index,ready:i.ready_index,
  bytes:i.index_bytes,scans:i.scans
 }))};
}
export function createReindexHandlers({contextFor=createProjectWriteContext,
 verifyTarget=verifyConnectionTarget,query=runPublicSqlQuery,
 mutate=runReviewedReindexMutation}={}){
 async function observe(a,c){
  if(c?.connection?.profile!=='full'||!valid(a?.schemaName)||
     a.schemaName.startsWith('pg_')||a.schemaName==='information_schema'||
     !valid(a.tableName)||!['index','table'].includes(a.scope)||
     a.scope==='index'&&!valid(a.indexName)||
     a.scope==='table'&&a.indexName!==undefined)
   throw Error('Full owner and exact non-system reindex scope required');
  const v=await verifyTarget(a,c);
  if(v.pid!==a.projectId||v.bid!==a.branchId||v.endpointId!==a.endpointId||
     v.database!==a.databaseName||v.role!==a.roleName||
     typeof v.endpoint?.host!=='string')
   throw Error('Reindex target identity mismatch');
  const target={projectId:v.pid,branchId:v.bid,endpointId:v.endpointId,
   expectedEndpointHost:v.endpoint.host,database:v.database,role:v.role,pooled:false};
  const tables=await query({ctx:c,target,text:TABLES_SQL,params:[a.schemaName]});
  const inventory=await query({ctx:c,target,text:INDEX_INVENTORY_SQL,params:[a.schemaName]});
  if(!complete(tables)||!complete(inventory)||
     tables.rows.filter(x=>x.table_name===a.tableName&&x.relation_kind==='r').length!==1||
     inventory.rows.some(x=>!validIndex(x))||
     new Set(inventory.rows.map(x=>x.index_name)).size!==inventory.rows.length)
   throw Error('Complete regular-table/index inventory is required');
  const all=inventory.rows.filter(x=>x.table_name===a.tableName);
  const selection=a.scope==='index'?all.filter(x=>x.index_name===a.indexName):all;
  if(!selection.length||a.scope==='index'&&selection.length!==1||
     selection.some(x=>!x.valid_index||!x.ready_index))
   throw Error('Only observed valid ready indexes can be rebuilt');
  // Refuse a same-name index on a different table rather than silently
  // selecting nothing, and never silently rebuild an incomplete inventory.
  if(a.scope==='index'&&inventory.rows.some(x=>x.index_name===a.indexName&&x.table_name!==a.tableName))
   throw Error('Requested index belongs to a different table');
  return {target,scope:a.scope,table:a.tableName,indexes:selection};
 }
 const write=defineWrite({name:'neon_health_reindex',destructive:true,
  plan:async(a,c)=>{
   const before=await observe(a,c),chosen=a.scope==='index'?a.indexName:a.tableName;
   return {projectId:before.target.projectId,branchId:before.target.branchId,
    target:'reindex:'+before.target.projectId+'/'+before.target.branchId+'/'+before.target.database+
     '/'+a.schemaName+'/'+a.scope+'/'+chosen,before,
    summary:'Rebuild '+a.scope+' '+a.schemaName+'.'+chosen+
     ' CONCURRENTLY on a verified development regular table. '+before.indexes.length+
     ' observed valid indexes; sizes and scans are observations, not reliable bloat estimates.'+
     ' PostgreSQL may create temporary _ccnew artifacts after failure; never automatically retry or drop them.'+
     ' It uses compute/IO and may wait for running transactions.'};
  },
  apply:async(a,c,{before})=>{
   const fresh=await observe(a,c);
   if(JSON.stringify(signature(fresh))!==JSON.stringify(signature(before)))
    throw Error('Index catalog changed; fresh owner preview required');
   const cls=await classifyTarget(c,fresh.target);
   if(!cls.allowed||cls.production||
      await c.guards.checkProtected(fresh.target,c)!==true||
      await c.guards.checkApp(fresh.target,c,{...a,outsideApp:false})!==true)
    throw Error('Development reindex target no longer eligible');
   const result=await mutate({ctx:c,target:fresh.target,schema:a.schemaName,table:a.tableName,
    index:a.indexName,scope:a.scope});
   return {confirmed:result?.issued===true?true:'pending'};
  },
  readAfter:observe,
  verify:async(before,after)=>JSON.stringify(signature(before))===
   JSON.stringify(signature(after))&&after.indexes.every(x=>x.valid_index&&x.ready_index)});
 const tool={...write.tool,profiles:['full'],area:'health',audience:['owner','operator'],
  description:'Confirm a development INDEX or TABLE REINDEX CONCURRENTLY with exact catalog readback; never auto-retry.',
  inputSchema:{type:'object',properties:{projectId:id,branchId:id,endpointId:id,
   databaseName:ident,roleName:ident,schemaName:ident,tableName:ident,
   scope:{type:'string',enum:['index','table']},indexName:ident,
   dryRun:{type:'boolean'},confirm:{type:'boolean'},
   requestKey:{type:'string',pattern:'^rmcp_[a-z0-9_]+$',minLength:10,maxLength:128}},
   required:['projectId','branchId','endpointId','databaseName','roleName',
    'schemaName','tableName','scope'],additionalProperties:false}};
 return {tools:[tool],handlers:{async neon_health_reindex(a,connectionCtx){
  const ctx=await contextFor(connectionCtx),result=await write.handler(a,ctx);
  const value=JSON.parse(result.content[0].text);
  if(value.confirmed==='pending'){
   try{const observed=publicObservation(await observe(a,ctx));
    return {content:[{type:'text',text:JSON.stringify({...value,
     observationOnly:true,observed,
     warning:'Operation unconfirmed; inspect invalid _ccnew artifacts before any separately approved cleanup. Do not retry.'})}]};}
   catch{/* Ambiguous operation stays pending, even when observation is unavailable. */}
  }
  return result;
 }}};
}
const registered=createReindexHandlers();
export const tools=registered.tools;
export const handlers=registered.handlers;
