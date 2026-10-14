// D-5: public read-only SQL through the existing B-3 safety layer.
import {verifyConnectionTarget} from './connections.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';

const dbName={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const base=defineReadTool('neon_sql_query',
 'Run one safe read-only SQL statement on a verified Neon branch and direct endpoint.',
 {projectId:readId,branchId:readId,endpointId:readId,databaseName:dbName,
 roleName:dbName,query:{type:'string',minLength:1,maxLength:20000},
 params:{type:'array',maxItems:100,items:{type:['string','number','boolean','null']}}},
 {area:'sql'});
export const tools=[{...base,inputSchema:{...base.inputSchema,
 required:['projectId','branchId','endpointId','databaseName','roleName','query']}}];

export function createSqlQueryHandlers({
 verifyTarget=verifyConnectionTarget,
 contextFor=createProjectWriteContext,
 runQuery=runPublicSqlQuery
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
  }
 };
}
export const handlers=createSqlQueryHandlers();
