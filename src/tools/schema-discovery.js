// D-6: fixed catalog discovery and search. Read-only; no application rows.
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';

const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const common={projectId:readId,branchId:readId,endpointId:readId,
 databaseName:ident,roleName:ident};
const ids=['projectId','branchId','endpointId','databaseName','roleName'];
export const KINDS=Object.freeze(['views','materialized_views','functions',
 'enums','sequences','triggers','policies','publications']);
const search=defineReadTool('neon_schema_search',
 'Search tables and columns across schema names without reading application rows.',
 {...common,term:{type:'string',minLength:2,maxLength:64},schemaName:ident},
 {area:'schema'});
const objects=defineReadTool('neon_schema_list_objects',
 'List views, functions, enum types, sequences, triggers, RLS policies or publications.',
 {...common,kind:{type:'string',enum:KINDS},schemaName:ident},
 {area:'schema'});
export const tools=[
 {...search,inputSchema:{...search.inputSchema,required:[...ids,'term']}},
 {...objects,inputSchema:{...objects.inputSchema,required:[...ids,'kind']}}
];
const visible=" AND n.nspname NOT IN ('pg_catalog','information_schema')"+
 " AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'";
export const SEARCH_SQL=
 'SELECT x.schema_name,x.object_name,x.kind FROM ('+
 ' SELECT n.nspname AS schema_name,c.relname AS object_name,'+
 " 'relation'::text AS kind FROM pg_catalog.pg_class c"+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 " WHERE c.relkind IN ('r','p','v','m')"+visible+
 " AND c.relname ILIKE ('%'||$1||'%')"+
 ' AND ($2::text IS NULL OR n.nspname=$2)'+
 ' UNION ALL SELECT n.nspname,(c.relname||\'.\'||a.attname),'+
 " 'column'::text FROM pg_catalog.pg_attribute a"+
 ' JOIN pg_catalog.pg_class c ON c.oid=a.attrelid'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 " WHERE c.relkind IN ('r','p','v','m') AND a.attnum>0"+
 ' AND NOT a.attisdropped'+visible+
 " AND a.attname ILIKE ('%'||$1||'%')"+
 ' AND ($2::text IS NULL OR n.nspname=$2)'+
 ' ) x ORDER BY x.schema_name,x.object_name,x.kind LIMIT 201';
const object=(joins,condition,expression)=>
 'SELECT n.nspname AS schema_name,'+expression+' AS object_name FROM '+
 joins+' WHERE '+condition+visible+
 ' AND ($1::text IS NULL OR n.nspname=$1)'+
 ' ORDER BY schema_name,object_name LIMIT 201';
const rel='pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace';
export const OBJECT_SQL=Object.freeze({
 views:object(rel,"c.relkind='v'",'c.relname'),
 materialized_views:object(rel,"c.relkind='m'",'c.relname'),
 functions:object('pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n'+
  ' ON n.oid=p.pronamespace',"p.prokind IN ('f','p')",'p.oid::regprocedure::text'),
 enums:object('pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n'+
  ' ON n.oid=t.typnamespace',"t.typtype='e'",'t.typname'),
 sequences:object(rel,"c.relkind='S'",'c.relname'),
 triggers:object('pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c'+
  ' ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace',
  'NOT t.tgisinternal',"(t.tgname||' on '||c.relname)"),
 policies:object('pg_catalog.pg_policy p JOIN pg_catalog.pg_class c'+
  ' ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace',
  'true',"(p.polname||' on '||c.relname)"),
 publications:'SELECT NULL::text AS schema_name,p.pubname AS object_name'+
  ' FROM pg_catalog.pg_publication p WHERE $1::text IS NULL'+
  ' ORDER BY p.pubname LIMIT 201'
});
function visibleRows(result){
 if(result?.done!==true)return {done:false,code:result?.code??'catalog_unavailable',
  complete:false};
 return {done:true,rows:result.rows??[],
  count:result.rowCount??0,
  complete:Array.isArray(result.rows)&&result.truncated===false&&
   result.columnsCapped!==true&&result.cellsCapped!==true&&
   result.rows.length===result.rowCount&&result.rows.length<=200};
}
const isName=s=>typeof s==='string'&&new RegExp(ident.pattern).test(s);
export function createSchemaDiscoveryHandlers({
 verifyTarget=verifyConnectionTarget,
 contextFor=createProjectWriteContext,runQuery=runPublicSqlQuery}={}){
 async function verified(args,c){
  const v=await verifyTarget(args,c);
  if(v.pid!==args.projectId||v.bid!==args.branchId||
     v.endpointId!==args.endpointId||v.database!==args.databaseName||
     v.role!==args.roleName||typeof v.endpoint?.host!=='string')
   throw Error('Schema discovery requires exact provider identities');
  return {ctx:await contextFor(c),target:{
   projectId:v.pid,branchId:v.bid,endpointId:v.endpointId,
   expectedEndpointHost:v.endpoint.host,database:v.database,role:v.role,pooled:false}};
 }
 return {
  async neon_schema_search(a,c){
   if(typeof a.term!=='string'||a.term.length<2||a.term.length>64||
      a.schemaName!==undefined&&!isName(a.schemaName))
    throw Error('Supply a bounded search term and valid optional schema');
   const ctx=await verified(a,c);
   return readText({...visibleRows(await runQuery({...ctx,text:SEARCH_SQL,
    params:[a.term,a.schemaName??null]})),term:a.term});
  },
  async neon_schema_list_objects(a,c){
   if(!KINDS.includes(a.kind)||a.schemaName!==undefined&&!isName(a.schemaName)||
      a.kind==='publications'&&a.schemaName!==undefined)
    throw Error('Choose a supported catalog kind and compatible schema');
   const ctx=await verified(a,c);
   return readText({...visibleRows(await runQuery({...ctx,
    text:OBJECT_SQL[a.kind],params:[a.schemaName??null]})),kind:a.kind});
  }
 };
}
export const handlers=createSchemaDiscoveryHandlers();
