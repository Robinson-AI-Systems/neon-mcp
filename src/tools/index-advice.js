// D-6: evidence-based, non-executing index candidates for explicitly chosen columns.
// Catalog and statistics only; query text and application rows are never collected.
import {createHash} from 'node:crypto';
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';

const identifier={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const valid=x=>typeof x==='string'&&new RegExp(identifier.pattern).test(x);
const schemaValid=x=>valid(x)&&x!=='pg_catalog'&&x!=='information_schema'&&
 !x.startsWith('pg_toast')&&!x.startsWith('pg_temp_');
const scope={projectId:readId,branchId:readId,endpointId:readId,
 databaseName:identifier,roleName:identifier,schemaName:identifier,
 tableName:identifier,columns:{type:'array',minItems:1,maxItems:3,
 uniqueItems:true,items:identifier}};
const base=defineReadTool('neon_health_suggest_indexes',
 'Review bounded table-scan statistics and propose a non-executing candidate index on explicitly selected columns.',
 scope,{area:'health'});
export const tools=[{...base,inputSchema:{...base.inputSchema,
 required:['projectId','branchId','endpointId','databaseName','roleName',
 'schemaName','tableName','columns']}}];

export const INDEX_STATS_SQL='SELECT s.seq_scan::bigint AS seq_scans,'+
 ' s.seq_tup_read::bigint AS sequential_rows_read,'+
 ' s.idx_scan::bigint AS index_scans'+
 ' FROM pg_catalog.pg_stat_user_tables s JOIN pg_catalog.pg_class c ON c.oid=s.relid'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 " WHERE n.nspname=$1 AND c.relname=$2 AND c.relkind IN ('r','p') LIMIT 201";
export const INDEX_COLUMNS_SQL='SELECT a.attname AS column_name,'+
 ' EXISTS(SELECT 1 FROM pg_catalog.pg_index i'+
 ' WHERE i.indrelid=c.oid AND i.indisvalid AND i.indisready'+
 ' AND i.indkey[0]=a.attnum) AS is_leading_index_column'+
 ' FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 " WHERE n.nspname=$1 AND c.relname=$2 AND c.relkind IN ('r','p')"+
 ' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 201';
const observed=x=>x?.done===true&&x.truncated===false&&
 x.cellsCapped!==true&&x.columnsCapped!==true&&
 Array.isArray(x.rows)&&x.rows.length===x.rowCount&&x.rows.length<=200;
const count=x=>{const n=Number(x);return x!==null&&x!==undefined&&
 Number.isSafeInteger(n)&&n>=0?n:null;};
const quote=x=>'"'+x.replaceAll('"','""')+'"';
export function candidateIndexDDL(schema,table,columns){
 if(!schemaValid(schema)||!valid(table)||!Array.isArray(columns)||
 columns.length<1||columns.length>3||new Set(columns).size!==columns.length||
 columns.some(x=>!valid(x)))throw Error('Unsafe index identifiers');
 const seed=table+'_'+columns.join('_')+'_idx';
 const suffix=createHash('sha256').update([schema,table,...columns].join('\0'))
  .digest('hex').slice(0,8);
 const name=seed.slice(0,54).replace(/_+$/,'')+'_'+suffix;
 return 'CREATE INDEX CONCURRENTLY IF NOT EXISTS '+quote(name)+
  ' ON '+quote(schema)+'.'+quote(table)+' ('+
  columns.map(quote).join(', ')+');';
}
export function createIndexAdviceHandlers({verifyTarget=verifyConnectionTarget,
 contextFor=createProjectWriteContext,runQuery=runPublicSqlQuery}={}){
 return {async neon_health_suggest_indexes(args,c){
  if(!schemaValid(args?.schemaName)||!valid(args.tableName)||
   !Array.isArray(args.columns)||args.columns.length<1||
   args.columns.length>3||new Set(args.columns).size!==args.columns.length||
   args.columns.some(x=>!valid(x)))
   throw Error('Choose an exact non-system table and one to three distinct columns');
  const v=await verifyTarget(args,c);
  if(v.pid!==args.projectId||v.bid!==args.branchId||
     v.endpointId!==args.endpointId||v.database!==args.databaseName||
     v.role!==args.roleName||typeof v.endpoint?.host!=='string')
   throw Error('Unverified index advisory target');
  const ctx=await contextFor(c),target={projectId:v.pid,branchId:v.bid,
   endpointId:v.endpointId,expectedEndpointHost:v.endpoint.host,
   database:v.database,role:v.role,pooled:false};
  const params=[args.schemaName,args.tableName];
  const stats=await runQuery({ctx,target,text:INDEX_STATS_SQL,params});
  const cols=await runQuery({ctx,target,text:INDEX_COLUMNS_SQL,params});
  if(!observed(stats)||!observed(cols)||stats.rows.length!==1||
     cols.rows.length===0)return readText({done:false,complete:false,
      code:'catalog_unavailable_or_incomplete'});
  const keys=cols.rows.map(x=>x.column_name);
  if(new Set(keys).size!==keys.length||keys.some(x=>!valid(x))||
     cols.rows.some(x=>typeof x.is_leading_index_column!=='boolean'))
   return readText({done:false,complete:false,code:'catalog_invalid'});
  if(args.columns.some(x=>!keys.includes(x)))
   return readText({done:false,complete:false,code:'column_not_found'});
  const s=stats.rows[0],seqScans=count(s.seq_scans),
   rowsRead=count(s.sequential_rows_read),indexScans=count(s.index_scans);
  if([seqScans,rowsRead,indexScans].some(x=>x===null))
   return readText({done:false,complete:false,code:'statistics_unknown'});
  const covered=cols.rows.some(x=>x.column_name===args.columns[0]&&
   x.is_leading_index_column);
  const enough=seqScans>=100&&rowsRead>=10000;
  const proposed=!covered&&enough;
  return readText({done:true,complete:true,table:{schemaName:args.schemaName,
   tableName:args.tableName},columns:args.columns,
   observations:{sequentialScans:seqScans,sequentialRowsRead:rowsRead,
    indexScans,existingIndexLeadsWithFirstColumn:covered},
   disposition:covered?'existing_leading_index':
    !enough?'insufficient_scan_evidence':'review_candidate',
   candidateDDL:proposed?candidateIndexDDL(args.schemaName,args.tableName,args.columns):null,
   neverExecuted:true,
   note:'This is a hypothesis based on non-atomic cumulative scan statistics and owner-selected columns, not query-predicate/selectivity proof. Review actual predicates, selectivity, write costs, index size and existing composite indexes before any separate guarded DDL.'});
 }};
}
export const handlers=createIndexAdviceHandlers();
