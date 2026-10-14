// D-6: fixed catalog SQL for safe owner/developer schema exploration.
// Caller identifiers bind as values; never interpolate SQL or read application rows.
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';

const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const scope={projectId:readId,branchId:readId,endpointId:readId,
 databaseName:ident,roleName:ident};
const required=['projectId','branchId','endpointId','databaseName','roleName'];
const specs=[
 ['neon_schema_list_schemas','List bounded non-system schemas with table counts.',{}],
 ['neon_schema_list_tables','List sizes, estimates and RLS flags of tables within one bound schema.',
   {schemaName:ident}],
 ['neon_schema_describe_table','Describe columns, indexes, constraints and RLS-policy metadata without table data.',
   {schemaName:ident,tableName:ident}],
 ['neon_schema_list_extensions','List installed and available PostgreSQL extensions without changing installation.',{}]
];
export const tools=specs.map(([name,description,extra])=>{
 const base=defineReadTool(name,description,{...scope,...extra},{area:'schema'});
 return {...base,inputSchema:{...base.inputSchema,
  required:[...required,...Object.keys(extra)]}};
});
const noSystem=" AND n.nspname NOT IN ('pg_catalog','information_schema')"+
 " AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'";
export const SCHEMAS_SQL=
 'SELECT n.nspname AS schema_name,COUNT(c.oid)::int AS table_count'+
 ' FROM pg_catalog.pg_namespace n LEFT JOIN pg_catalog.pg_class c'+
 " ON c.relnamespace=n.oid AND c.relkind IN ('r','p') WHERE true"+noSystem+
 ' GROUP BY n.nspname ORDER BY n.nspname LIMIT 201';
export const TABLES_SQL=
 'SELECT c.relname AS table_name,c.relkind AS relation_kind,'+
 ' c.reltuples::bigint AS estimated_rows,'+
 ' pg_catalog.pg_total_relation_size(c.oid)::bigint AS total_bytes,'+
 ' c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced'+
 ' FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n'+
 ' ON n.oid=c.relnamespace WHERE n.nspname=$1'+
 " AND c.relkind IN ('r','p') ORDER BY c.relname LIMIT 201";
export const COLUMNS_SQL=
 'SELECT a.attnum AS ordinal_position,a.attname AS column_name,'+
 ' pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,'+
 ' (NOT a.attnotnull) AS nullable,a.attidentity::text AS identity_mode,'+
 ' a.attgenerated::text AS generated_mode'+
 ' FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c'+
 ' ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n'+
 ' ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2'+
 " AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped"+
 ' ORDER BY a.attnum LIMIT 201';
export const INDEXES_SQL=
 'SELECT ic.relname AS index_name,i.indisunique AS unique_index,'+
 ' i.indisprimary AS primary_index,i.indisvalid AS valid_index'+
 ' FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c'+
 ' ON c.oid=i.indrelid JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 " WHERE n.nspname=$1 AND c.relname=$2 AND c.relkind IN ('r','p')"+
 ' ORDER BY ic.relname LIMIT 201';
export const CONSTRAINTS_SQL=
 'SELECT con.conname AS constraint_name,con.contype::text AS constraint_type,'+
 ' con.convalidated AS validated'+
 ' FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c'+
 ' ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 " WHERE n.nspname=$1 AND c.relname=$2 AND c.relkind IN ('r','p')"+
 ' ORDER BY con.conname LIMIT 201';
export const POLICIES_SQL=
 'SELECT pol.polname AS policy_name,pol.polcmd::text AS policy_command,'+
 ' pol.polpermissive AS permissive'+
 ' FROM pg_catalog.pg_policy pol JOIN pg_catalog.pg_class c'+
 ' ON c.oid=pol.polrelid JOIN pg_catalog.pg_namespace n'+
 ' ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2'+
 " AND c.relkind IN ('r','p') ORDER BY pol.polname LIMIT 201";
export const EXTENSIONS_SQL=
 'SELECT avail.name AS extension_name,avail.default_version,'+
 ' installed.extversion AS installed_version FROM pg_catalog.pg_available_extensions avail'+
 ' LEFT JOIN pg_catalog.pg_extension installed ON installed.extname=avail.name'+
 ' ORDER BY avail.name LIMIT 201';
function verifiedRows(data){
 return data?.done===true&&Array.isArray(data.rows)&&
  data.truncated===false&&data.columnsCapped!==true&&
  data.cellsCapped!==true&&data.rows.length===data.rowCount&&
  data.rows.length<=200;
}
function visible(data){
 if(data?.done!==true)return {done:false,code:data?.code??'catalog_unavailable',
  message:'Verified catalog read was unavailable',complete:false};
 return {done:true,rows:Array.isArray(data.rows)?data.rows:[],
  count:data.rowCount??0,complete:verifiedRows(data)};
}
export function createSchemaReadHandlers({
 verifyTarget=verifyConnectionTarget,
 contextFor=createProjectWriteContext,runQuery=runPublicSqlQuery}={}){
 async function context(args,c){
  const id=await verifyTarget(args,c);
  if(id.pid!==args.projectId||id.bid!==args.branchId||
    id.endpointId!==args.endpointId||id.database!==args.databaseName||
    id.role!==args.roleName||typeof id.endpoint?.host!=='string')
   throw Error('Verified schema connection identities mismatch');
  return {ctx:await contextFor(c),target:{projectId:id.pid,branchId:id.bid,
   endpointId:id.endpointId,expectedEndpointHost:id.endpoint.host,
   database:id.database,role:id.role,pooled:false}};
 }
 const query=(context,text,params=[])=>runQuery({...context,text,params});
 return {
  async neon_schema_list_schemas(a,c){
   const k=await context(a,c);return readText(visible(await query(k,SCHEMAS_SQL)));
  },
  async neon_schema_list_tables(a,c){
   if(typeof a.schemaName!=='string'||!new RegExp(ident.pattern).test(a.schemaName))
    throw Error('Select a safe exact schema name');
   const k=await context(a,c);
   return readText({...visible(await query(k,TABLES_SQL,[a.schemaName])),
    schemaName:a.schemaName});
  },
  async neon_schema_describe_table(a,c){
   if(typeof a.schemaName!=='string'||!new RegExp(ident.pattern).test(a.schemaName)||
     typeof a.tableName!=='string'||!new RegExp(ident.pattern).test(a.tableName))
    throw Error('Select exact schema and table names');
   const k=await context(a,c),p=[a.schemaName,a.tableName];
   const results=await Promise.all([
    query(k,COLUMNS_SQL,p),query(k,INDEXES_SQL,p),
    query(k,CONSTRAINTS_SQL,p),query(k,POLICIES_SQL,p)]);
   const [columns,indexes,constraints,policies]=results.map(visible);
   if(!columns.done||!columns.rows.length||results.some(x=>x.done!==true))
    return readText({done:false,code:'catalog_incomplete',complete:false,
     message:'Table metadata or independent catalog reads unavailable'});
   return readText({done:true,schemaName:a.schemaName,tableName:a.tableName,
    complete:[columns,indexes,constraints,policies].every(x=>x.complete),
    columns:columns.rows,indexes:indexes.rows,
    constraints:constraints.rows,rlsPolicies:policies.rows,
    note:'Policy names are metadata; policy expressions and effective access are not evaluated.'});
  },
  async neon_schema_list_extensions(a,c){
   const k=await context(a,c);return readText(visible(await query(k,EXTENSIONS_SQL)));
  }
 };
}
export const handlers=createSchemaReadHandlers();
