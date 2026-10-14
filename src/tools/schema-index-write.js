// D-6 confirmed development-only concurrent index creation/removal.
import {defineWrite} from '../core/write.js';
import {classifyTarget} from '../neon/production.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery,runReviewedIndexMutation} from '../neon/sql-run.js';
import {TABLES_SQL,COLUMNS_SQL} from './schema-reads.js';
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const valid=x=>typeof x==='string'&&new RegExp(ident.pattern).test(x);
const whole=x=>x?.done===true&&x.truncated===false&&x.cellsCapped!==true&&
 x.columnsCapped!==true&&Array.isArray(x.rows)&&x.rowCount===x.rows.length&&x.rows.length<=200;
export const INDEX_INVENTORY_SQL='SELECT ix.oid::text AS index_oid,ix.relname AS index_name,'+
 ' t.relname AS table_name,i.indisvalid AS valid_index,i.indisready AS ready_index,'+
 ' i.indisunique AS unique_index,i.indisprimary AS primary_index,'+
 ' i.indisexclusion AS exclusion_index,'+
 ' EXISTS(SELECT 1 FROM pg_catalog.pg_constraint con WHERE con.conindid=ix.oid) AS constraint_index,'+
 ' am.amname AS method,(i.indpred IS NOT NULL OR i.indexprs IS NOT NULL) AS custom_expression,'+
 ' i.indnkeyatts::int AS key_count,i.indnatts::int AS attribute_count,'+
 ' pg_catalog.pg_relation_size(ix.oid)::text AS index_bytes,s.idx_scan::text AS scans,'+
 ' ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey) WITH ORDINALITY k(attnum,ord)'+
 ' LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum ORDER BY k.ord) AS columns'+
 ' FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid'+
 ' JOIN pg_catalog.pg_class t ON t.oid=i.indrelid'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=ix.relnamespace'+
 ' JOIN pg_catalog.pg_am am ON am.oid=ix.relam'+
 ' LEFT JOIN pg_catalog.pg_stat_user_indexes s ON s.indexrelid=ix.oid'+
 " WHERE n.nspname=$1 AND t.relkind='r' ORDER BY ix.relname LIMIT 201";
function safeIndex(row){
 return row&&/^\d+$/.test(row.index_oid)&&valid(row.index_name)&&valid(row.table_name)&&
 ['valid_index','ready_index','unique_index','primary_index','constraint_index','custom_expression']
  .every(k=>typeof row[k]==='boolean')&&typeof row.method==='string'&&
 Number.isInteger(row.key_count)&&row.key_count>=1&&Number.isInteger(row.attribute_count)&&
 row.attribute_count>=row.key_count&&row.attribute_count<=32&&
 /^\d+$/.test(row.index_bytes)&&(row.scans===null||/^\d+$/.test(row.scans))&&
 Array.isArray(row.columns)&&row.columns.length===row.attribute_count&&
 row.columns.every(x=>x===null||valid(x));
}
const ordinary=x=>x.method==='btree'&&!x.unique_index&&!x.primary_index&&
 !x.constraint_index&&!x.custom_expression&&x.key_count===x.attribute_count&&
 x.columns.every(valid);
export function createIndexWriteHandlers({contextFor=createProjectWriteContext,
 verifyTarget=verifyConnectionTarget,query=runPublicSqlQuery,mutate=runReviewedIndexMutation}={}){
 async function observe(a,c){
  if(c?.connection?.profile!=='full'||!valid(a.schemaName)||a.schemaName.startsWith('pg_')||
   a.schemaName==='information_schema'||!valid(a.tableName)||!valid(a.indexName))
   throw Error('Full owner and exact non-system index identifiers required');
  const v=await verifyTarget(a,c);
  if(v.pid!==a.projectId||v.bid!==a.branchId||v.endpointId!==a.endpointId||
   v.database!==a.databaseName||v.role!==a.roleName||typeof v.endpoint?.host!=='string')
   throw Error('Index target identity mismatch');
  const target={projectId:v.pid,branchId:v.bid,endpointId:v.endpointId,
   expectedEndpointHost:v.endpoint.host,database:v.database,role:v.role,pooled:false};
  const run=(text,params)=>query({ctx:c,target,text,params});
  const tables=await run(TABLES_SQL,[a.schemaName]),cols=await run(COLUMNS_SQL,[a.schemaName,a.tableName]),
   indexes=await run(INDEX_INVENTORY_SQL,[a.schemaName]);
  if(!whole(tables)||!whole(cols)||!whole(indexes)||
   tables.rows.filter(x=>x.table_name===a.tableName&&x.relation_kind==='r').length!==1||
   !cols.rows.length||cols.rows.some(x=>!valid(x.column_name))||
   indexes.rows.some(x=>!safeIndex(x))||
   new Set(indexes.rows.map(x=>x.index_name)).size!==indexes.rows.length)
   throw Error('Complete regular-table and index catalogs required');
  const index=indexes.rows.find(x=>x.index_name===a.indexName)??null;
  if(index&&index.table_name!==a.tableName)throw Error('Index belongs to a different table');
  return {target,index,columns:cols.rows.map(x=>x.column_name)};
 }
 const tools=[],handlers={};
 for(const remove of [false,true]){
  const name=remove?'neon_schema_drop_index':'neon_schema_create_index';
  const write=defineWrite({name,destructive:remove,
   plan:async(a,c)=>{const before=await observe(a,c);
    if(!remove&&(!Array.isArray(a.columns)||a.columns.length<1||a.columns.length>3||
     new Set(a.columns).size!==a.columns.length||a.columns.some(x=>!before.columns.includes(x))))
     throw Error('Select one-to-three observed distinct columns');
    if(before.index&&(!ordinary(before.index)||!remove&&
      (JSON.stringify(before.index.columns)!==JSON.stringify(a.columns)||
       !before.index.valid_index||!before.index.ready_index)))
     throw Error('Only ordinary matching B-tree indexes are eligible');
    return {projectId:before.target.projectId,branchId:before.target.branchId,
     target:'index:'+before.target.projectId+'/'+before.target.branchId+'/'+before.target.database+'/'+a.schemaName+'/'+a.indexName,
     before,summary:(remove?'Drop ':'Create ')+a.schemaName+'.'+a.indexName+
      ' on development table '+a.tableName+' CONCURRENTLY. '+
      (before.index?'Observed index bytes '+before.index.index_bytes+', scans '+(before.index.scans??'unknown')+'. ':'')+
      'Compute/storage usage applies; removing indexes may slow queries. No unique, primary, constraint, partial or expression indexes; no CASCADE. A failed build may leave an invalid index; cleanup needs separate confirmation.'};},
   apply:async(a,c,{before})=>{
    const fresh=await observe(a,c);
    const signature=x=>({...x,index:x.index?{...x.index,index_bytes:null,scans:null}:null});
    if(JSON.stringify(signature(fresh))!==JSON.stringify(signature(before)))throw Error('Index/table catalog changed; review again');
    const cls=await classifyTarget(c,fresh.target);
    if(!cls.allowed||cls.production||await c.guards.checkProtected(fresh.target,c)!==true||
      await c.guards.checkApp(fresh.target,c,{...a,outsideApp:false})!==true)
     throw Error('Development index target no longer eligible');
    if(remove&&!fresh.index||!remove&&fresh.index)return {confirmed:true};
    const result=await mutate({ctx:c,target:fresh.target,schema:a.schemaName,
     table:a.tableName,index:a.indexName,columns:a.columns,remove});
    return {confirmed:result?.issued===true?true:'pending'};
   },readAfter:observe,verify:async(before,after,a)=>
    JSON.stringify(before.target)===JSON.stringify(after.target)&&
    (remove?after.index===null:after.index!==null&&ordinary(after.index)&&
     after.index.valid_index&&after.index.ready_index&&
     JSON.stringify(after.index.columns)===JSON.stringify(a.columns))});
  const properties={projectId:id,branchId:id,endpointId:id,databaseName:ident,roleName:ident,
   schemaName:ident,tableName:ident,indexName:ident,
   ...(!remove?{columns:{type:'array',items:ident,minItems:1,maxItems:3,uniqueItems:true}}:{}),
   dryRun:{type:'boolean'},confirm:{type:'boolean'},
   requestKey:{type:'string',pattern:'^rmcp_[a-z0-9_]+$',minLength:10,maxLength:128}};
  tools.push({...write.tool,profiles:['full'],area:'schema',audience:['owner','builder'],
   description:remove?'Confirm ordinary development index removal CONCURRENTLY with RESTRICT.':
    'Confirm a development B-tree index CONCURRENTLY; independently verify columns, validity and readiness.',
   inputSchema:{type:'object',properties,required:Object.keys(properties).filter(x=>!['dryRun','confirm','requestKey'].includes(x)),additionalProperties:false}});
  handlers[name]=async(a,connectionCtx)=>{
   const ctx=await contextFor(connectionCtx),result=await write.handler(a,ctx);
   const value=JSON.parse(result.content[0].text);
   if(value.confirmed==='pending'){
    try{const state=await observe(a,ctx);return {content:[{type:'text',text:JSON.stringify({...value,
     observedIndex:state.index,indexObservationOnly:true,
     warning:'DDL outcome remains unconfirmed. Inspect this index; never retry automatically. Invalid-index removal requires separate owner confirmation.'})}]};}
    catch{/* Preserve original pending audit even if independent diagnostic fails. */}
   }
   return result;
  };
 }
 return {tools,handlers};
}
const built=createIndexWriteHandlers();export const tools=built.tools;export const handlers=built.handlers;
