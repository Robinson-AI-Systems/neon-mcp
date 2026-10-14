// D-6: reviewed development-only VACUUM (ANALYZE) on one regular table.
import {defineWrite} from '../core/write.js';
import {classifyTarget} from '../neon/production.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery,runReviewedVacuumMutation} from '../neon/sql-run.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const valid=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(x);
export const VACUUM_STATS_SQL=
 'SELECT c.oid::text AS relation_oid,c.relname AS table_name,'+
 " c.relkind AS relation_kind,c.relrowsecurity AS rls_enabled,"+
 ' pg_catalog.pg_total_relation_size(c.oid)::bigint AS total_bytes,'+
 ' s.n_dead_tup::bigint AS estimated_dead_rows,'+
 ' s.vacuum_count::bigint AS manual_vacuum_count,'+
 ' s.analyze_count::bigint AS manual_analyze_count,'+
 ' s.last_vacuum,s.last_analyze'+
 ' FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n'+
 ' ON n.oid=c.relnamespace JOIN pg_catalog.pg_stat_user_tables s ON s.relid=c.oid'+
 " WHERE n.nspname=$1 AND c.relname=$2 AND c.relkind='r' LIMIT 201";
const complete=x=>x?.done===true&&x.truncated===false&&
 x.columnsCapped!==true&&x.cellsCapped!==true&&Array.isArray(x.rows)&&
 x.rowCount===1&&x.rows.length===1;
function signature(v){
 return {target:v.target,relationOid:v.row.relation_oid,table:v.row.table_name,
  kind:v.row.relation_kind,rls:v.row.rls_enabled};
}
export function createVacuumHandlers({contextFor=createProjectWriteContext,
 verifyTarget=verifyConnectionTarget,query=runPublicSqlQuery,
 mutate=runReviewedVacuumMutation}={}){
 async function observe(a,c){
  if(c?.connection?.profile!=='full'||!valid(a?.schemaName)||
     a.schemaName.startsWith('pg_')||a.schemaName==='information_schema'||
     !valid(a.tableName))
   throw Error('Exact non-system regular-table scope and full owner required');
  const v=await verifyTarget(a,c);
  if(v.pid!==a.projectId||v.bid!==a.branchId||v.endpointId!==a.endpointId||
     v.database!==a.databaseName||v.role!==a.roleName||
     typeof v.endpoint?.host!=='string')
   throw Error('Vacuum target identity mismatch');
  const target={projectId:v.pid,branchId:v.bid,endpointId:v.endpointId,
   expectedEndpointHost:v.endpoint.host,database:v.database,role:v.role,pooled:false};
  const data=await query({ctx:c,target,text:VACUUM_STATS_SQL,params:[a.schemaName,a.tableName]});
  if(!complete(data))throw Error('Complete regular table evidence required');
  const row=data.rows[0];
  if(!row||!/^[0-9]+$/.test(row.relation_oid)||row.table_name!==a.tableName||
     row.relation_kind!=='r'||typeof row.rls_enabled!=='boolean'||
     !/^[0-9]+$/.test(row.total_bytes)||!/^[0-9]+$/.test(row.estimated_dead_rows)||
     !/^[0-9]+$/.test(row.manual_vacuum_count)||
     !/^[0-9]+$/.test(row.manual_analyze_count))
   throw Error('Unverified PostgreSQL table metadata');
  return {target,row};
 }
 const write=defineWrite({name:'neon_health_vacuum_analyze',destructive:false,
  plan:async(a,c)=>{
   const before=await observe(a,c);
   return {projectId:before.target.projectId,branchId:before.target.branchId,
    target:'vacuum:'+before.target.projectId+'/'+before.target.branchId+
     '/'+before.target.database+'/'+a.schemaName+'/'+a.tableName,
    before,summary:'Run non-FULL VACUUM (ANALYZE) on verified development table '+
     a.schemaName+'.'+a.tableName+' (observed '+before.row.estimated_dead_rows+
     ' estimated dead rows, '+before.row.total_bytes+' bytes). This may use compute/IO,'+
     ' wait on locks, and persist beyond client failure. The stored maintenance timeout defaults'+
     ' to ten minutes; progress counters are eventually consistent, not success proof.'};
  },
  apply:async(a,c,{before})=>{
   const current=await observe(a,c);
   if(JSON.stringify(signature(current))!==JSON.stringify(signature(before)))
    throw Error('Table identity changed before VACUUM; new preview needed');
   const state=await classifyTarget(c,current.target);
   if(!state.allowed||state.production||
      await c.guards.checkProtected(current.target,c)!==true||
      await c.guards.checkApp(current.target,c,{...a,outsideApp:false})!==true)
    throw Error('Development table maintenance denied');
   const result=await mutate({ctx:c,target:current.target,schema:a.schemaName,table:a.tableName});
   return {confirmed:result?.issued===true?true:'pending'};
  },
  readAfter:observe,
  verify:async(before,after)=>JSON.stringify(signature(before))===JSON.stringify(signature(after))});
 const tool={...write.tool,profiles:['full'],area:'health',audience:['owner','operator'],
  description:'Owner-confirmed development-table VACUUM (ANALYZE); never FULL, never auto-retry or vacuums system tables.',
  inputSchema:{type:'object',properties:{
   projectId:id,branchId:id,endpointId:id,databaseName:ident,roleName:ident,
   schemaName:ident,tableName:ident,dryRun:{type:'boolean'},confirm:{type:'boolean'},
   requestKey:{type:'string',pattern:'^rmcp_[a-z0-9_]+$',minLength:10,maxLength:128}},
   required:['projectId','branchId','endpointId','databaseName','roleName',
    'schemaName','tableName'],additionalProperties:false}};
 return {tools:[tool],handlers:{async neon_health_vacuum_analyze(a,connectionCtx){
  const ctx=await contextFor(connectionCtx);
  return write.handler(a,ctx);
 }}};
}
const registered=createVacuumHandlers();
export const tools=registered.tools;
export const handlers=registered.handlers;
