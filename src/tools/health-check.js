// D-6: fixed, bounded PostgreSQL health diagnostics. Never return SQL source or row data.
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';

const identifier={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const targetFields={projectId:readId,branchId:readId,endpointId:readId,
 databaseName:identifier,roleName:identifier};
const required=['projectId','branchId','endpointId','databaseName','roleName'];
const nonSystem=" AND n.nspname NOT IN ('pg_catalog','information_schema')"+
 " AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'";
const userTables='pg_catalog.pg_stat_user_tables s'+
 ' JOIN pg_catalog.pg_class c ON c.oid=s.relid'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace';
export const HEALTH_SQL=Object.freeze({
 database_size:'SELECT current_database() AS database_name,'+
  ' pg_catalog.pg_database_size(current_database())::bigint AS bytes LIMIT 201',
 cache_hit:'SELECT CASE WHEN blks_hit+blks_read=0 THEN NULL'+
  ' ELSE ROUND((blks_hit::numeric*100)/NULLIF(blks_hit+blks_read,0),2)'+
  ' END AS cache_hit_percent FROM pg_catalog.pg_stat_database'+
  ' WHERE datname=current_database() LIMIT 201',
 connections:'SELECT state,count(*)::int AS session_count'+
  ' FROM pg_catalog.pg_stat_activity WHERE datname=current_database()'+
  ' GROUP BY state ORDER BY state NULLS LAST LIMIT 201',
 locks:'SELECT l.mode,l.granted,count(*)::int AS lock_count'+
  ' FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid'+
  ' WHERE a.datname=current_database() GROUP BY l.mode,l.granted'+
  ' ORDER BY lock_count DESC,l.mode LIMIT 201',
 wait_events:'SELECT wait_event_type,wait_event,count(*)::int AS sessions'+
  ' FROM pg_catalog.pg_stat_activity WHERE datname=current_database()'+
  ' AND wait_event IS NOT NULL GROUP BY wait_event_type,wait_event'+
  ' ORDER BY sessions DESC LIMIT 201',
 long_queries:'SELECT pid,state,'+
  ' EXTRACT(EPOCH FROM now()-query_start)::int AS age_seconds'+
  ' FROM pg_catalog.pg_stat_activity WHERE datname=current_database()'+
  " AND state='active' AND query_start<now()-INTERVAL '30 seconds'"+
  ' AND pid<>pg_backend_pid() ORDER BY query_start ASC LIMIT 201',
 dead_tuples:'SELECT n.nspname AS schema_name,c.relname AS table_name,'+
  ' s.n_dead_tup::bigint AS estimated_dead_rows FROM '+userTables+
  ' WHERE true'+nonSystem+' ORDER BY s.n_dead_tup DESC,c.relname LIMIT 201',
 autovacuum:'SELECT n.nspname AS schema_name,c.relname AS table_name,'+
  ' s.last_autovacuum,s.autovacuum_count::bigint AS autovacuum_count FROM '+
  userTables+' WHERE true'+nonSystem+
  ' ORDER BY s.autovacuum_count DESC,c.relname LIMIT 201',
 index_usage:'SELECT n.nspname AS schema_name,s.relname AS table_name,'+
  ' s.indexrelname AS index_name,s.idx_scan::bigint AS scans'+
  ' FROM pg_catalog.pg_stat_user_indexes s JOIN pg_catalog.pg_class c'+
  ' ON c.oid=s.relid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
  ' JOIN pg_catalog.pg_index i ON i.indexrelid=s.indexrelid'+
  ' WHERE s.idx_scan=0 AND NOT i.indisprimary'+nonSystem+
  ' ORDER BY s.relname,s.indexrelname LIMIT 201',
 invalid_indexes:'SELECT n.nspname AS schema_name,c.relname AS table_name,'+
  ' idx.relname AS index_name FROM pg_catalog.pg_index i'+
  ' JOIN pg_catalog.pg_class c ON c.oid=i.indrelid'+
  ' JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid'+
  ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
  ' WHERE NOT i.indisvalid'+nonSystem+
  ' ORDER BY n.nspname,c.relname,idx.relname LIMIT 201',
 duplicate_indexes:'SELECT n.nspname AS schema_name,c.relname AS table_name,'+
  ' idx.relname AS index_name FROM pg_catalog.pg_index i'+
  ' JOIN pg_catalog.pg_class c ON c.oid=i.indrelid'+
  ' JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid'+
  ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
  ' WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_index j'+
  ' WHERE j.indrelid=i.indrelid AND j.indexrelid<>i.indexrelid'+
  ' AND j.indkey=i.indkey AND j.indclass=i.indclass'+
  ' AND j.indcollation=i.indcollation AND j.indpred IS NOT DISTINCT FROM i.indpred'+
  ' AND j.indexprs IS NOT DISTINCT FROM i.indexprs)'+nonSystem+
  ' ORDER BY n.nspname,c.relname,idx.relname LIMIT 201',
 xid_age:'SELECT age(datfrozenxid)::bigint AS frozen_xid_age'+
  ' FROM pg_catalog.pg_database WHERE datname=current_database() LIMIT 201',
 replication_slots:'SELECT slot_name,slot_type,active,'+
  ' restart_lsn::text AS restart_lsn FROM pg_catalog.pg_replication_slots'+
  ' WHERE database=current_database() ORDER BY slot_name LIMIT 201',
 table_sizes:'SELECT n.nspname AS schema_name,c.relname AS table_name,'+
  ' pg_catalog.pg_total_relation_size(c.oid)::bigint AS total_bytes'+
  ' FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
  " WHERE c.relkind IN ('r','p')"+nonSystem+
  ' ORDER BY total_bytes DESC,c.relname LIMIT 201',
 table_scan_stats:'SELECT n.nspname AS schema_name,c.relname AS table_name,'+
  ' s.seq_scan::bigint AS sequential_scans,'+
  ' s.idx_scan::bigint AS index_scans FROM '+userTables+
  ' WHERE true'+nonSystem+' ORDER BY s.seq_scan DESC,c.relname LIMIT 201'
});
export const HEALTH_CHECKS=Object.freeze(Object.keys(HEALTH_SQL));
export const HEALTH_DEFAULT=Object.freeze(['database_size','cache_hit',
 'connections','xid_age','invalid_indexes']);
const base=defineReadTool('neon_health_check',
 'Run selected bounded PostgreSQL health checks without SQL text, mutations or table data.',
 {...targetFields,checks:{type:'array',minItems:1,maxItems:15,uniqueItems:true,
  items:{type:'string',enum:HEALTH_CHECKS}}},{area:'health',audience:['operator']});
export const tools=[{...base,inputSchema:{...base.inputSchema,required}}];

function resultState(result){
 if(result?.done!==true)return {state:'unavailable',
  code:typeof result?.code==='string'?result.code:'read_unavailable'};
 if(!Array.isArray(result.rows)||result.truncated!==false||
    result.rows.length!==result.rowCount||
    result.columnsCapped===true||result.cellsCapped===true||
    result.rows.length>200)
  return {state:'incomplete',reason:'Catalog rows are capped or incomplete'};
 return {state:'observed',rows:result.rows,returned:result.rows.length};
}
export function createHealthHandlers({verifyTarget=verifyConnectionTarget,
 contextFor=createProjectWriteContext,runQuery=runPublicSqlQuery}={}){
 return {async neon_health_check(args,c){
  const checks=args.checks??HEALTH_DEFAULT;
  if(!Array.isArray(checks)||checks.length<1||checks.length>15||
     new Set(checks).size!==checks.length||
     checks.some(x=>!Object.hasOwn(HEALTH_SQL,x)))
   throw Error('Select up to fifteen unique known health checks');
  const v=await verifyTarget(args,c);
  if(v.pid!==args.projectId||v.bid!==args.branchId||
     v.endpointId!==args.endpointId||v.database!==args.databaseName||
     v.role!==args.roleName||typeof v.endpoint?.host!=='string')
   throw Error('Health target identities not independently verified');
  const ctx=await contextFor(c),target={projectId:v.pid,
   branchId:v.bid,endpointId:v.endpointId,expectedEndpointHost:v.endpoint.host,
   database:v.database,role:v.role,pooled:false};
  const results={};
  // Check sequentially; do not start fifteen parallel 0.25 CU compute sessions.
  for(const name of checks){
   try{
    const answer=await runQuery({ctx,target,text:HEALTH_SQL[name],params:[]});
    results[name]=resultState(answer);
   }catch{
    results[name]={state:'unavailable',code:'verified_query_unavailable'};
   }
  }
  return readText({projectId:v.pid,branchId:v.bid,database:v.database,
   requested:checks,checks:results,
   allObserved:checks.every(name=>results[name].state==='observed'),
   nonAtomic:true,
   note:'Nonatomic sample. Dead tuples, unused or duplicate indexes are signals, not proof of unsafe state or permission to change them.'});
 }};
}
export const handlers=createHealthHandlers();
