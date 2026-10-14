// D-5: public read-only SQL through the existing B-3 safety layer.
import {verifyConnectionTarget} from './connections.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery,runPublicSqlExplain} from '../neon/sql-run.js';

const dbName={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const base=defineReadTool('neon_sql_query',
 'Run one safe read-only SQL statement on a verified Neon branch and direct endpoint.',
 {projectId:readId,branchId:readId,endpointId:readId,databaseName:dbName,
 roleName:dbName,query:{type:'string',minLength:1,maxLength:20000},
 params:{type:'array',maxItems:100,items:{type:['string','number','boolean','null']}}},
 {area:'sql'});
const requiredTarget=['projectId','branchId','endpointId','databaseName','roleName'];
const common={projectId:readId,branchId:readId,endpointId:readId,
 databaseName:dbName,roleName:dbName};
const explain=defineReadTool('neon_sql_explain',
 'Explain an AST-verified SELECT; execution requires explicit analyze=true.',
 {...common,query:{type:'string',minLength:1,maxLength:20000},
 params:{type:'array',maxItems:100,items:{type:['string','number','boolean','null']}},
 analyze:{type:'boolean'}},{area:'sql'});
const slow=defineReadTool('neon_sql_list_slow_queries',
 'Show high-cost query fingerprints and execution statistics for the current database without raw SQL.',
 {...common},{area:'sql'});
const activity=defineReadTool('neon_sql_list_activity',
 'List bounded current-database session and wait metadata without SQL text.',
 {...common},{area:'sql',audience:['operator']});
export const tools=[
 {...base,inputSchema:{...base.inputSchema,required:[...requiredTarget,'query']}},
 {...explain,inputSchema:{...explain.inputSchema,required:[...requiredTarget,'query']}},
 {...activity,inputSchema:{...activity.inputSchema,required:requiredTarget}},
 {...slow,inputSchema:{...slow.inputSchema,required:requiredTarget}}
];
const SLOW_SQL='SELECT queryid,calls,rows,round(total_exec_time::numeric,2) AS total_ms,'+
 ' round(mean_exec_time::numeric,2) AS mean_ms,shared_blks_hit,shared_blks_read'+
 ' FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_catalog.pg_database'+
 ' WHERE datname=current_database()) ORDER BY total_exec_time DESC, queryid LIMIT 200';
const ACTIVITY_SQL='SELECT pid,datname,usename,state,wait_event_type,wait_event,'+
 ' EXTRACT(EPOCH FROM (now()-query_start))::int AS query_age_seconds'+
 ' FROM pg_catalog.pg_stat_activity WHERE datname = current_database()'+
 ' AND pid <> pg_backend_pid() ORDER BY query_start ASC NULLS LAST';


export function createSqlQueryHandlers({
 verifyTarget=verifyConnectionTarget,
 contextFor=createProjectWriteContext,
 runQuery=runPublicSqlQuery,
 runExplain=runPublicSqlExplain
}={}){
 return {
  async neon_sql_query(args,ctx){
   const verified=await verifyTarget(args,ctx);
   const trusted=await contextFor(ctx);
   const result=await runQuery({
    ctx:trusted,
    target:{projectId:verified.pid,branchId:verified.bid,
     endpointId:verified.endpointId,expectedEndpointHost:verified.endpoint.host,
     database:verified.database,role:verified.role,pooled:false},
    text:args.query,params:args.params??[]
   });
   return readText(result);
  },
  async neon_sql_explain(args,ctx){
   const verified=await verifyTarget(args,ctx);
   const trusted=await contextFor(ctx);
   const result=await runExplain({ctx:trusted,target:{
    projectId:verified.pid,branchId:verified.bid,endpointId:verified.endpointId,
    expectedEndpointHost:verified.endpoint.host,database:verified.database,
    role:verified.role,pooled:false},
   text:args.query,params:args.params??[],analyze:args.analyze??false});
   return readText(result);
  },
  async neon_sql_list_slow_queries(args,ctx){
   const verified=await verifyTarget(args,ctx);
   const trusted=await contextFor(ctx);
   const result=await runQuery({ctx:trusted,target:{
    projectId:verified.pid,branchId:verified.bid,endpointId:verified.endpointId,
    expectedEndpointHost:verified.endpoint.host,database:verified.database,
    role:verified.role,pooled:false},
   text:SLOW_SQL,params:[]});
   return readText(result);
  },
  async neon_sql_list_activity(args,ctx){
   const verified=await verifyTarget(args,ctx);
   const trusted=await contextFor(ctx);
   const result=await runQuery({ctx:trusted,target:{
    projectId:verified.pid,branchId:verified.bid,endpointId:verified.endpointId,
    expectedEndpointHost:verified.endpoint.host,database:verified.database,
    role:verified.role,pooled:false},
   text:ACTIVITY_SQL,params:[]});
   return readText(result);
  }
 };
}
export const handlers=createSqlQueryHandlers();
