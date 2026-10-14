// D-9: read-only migration state from well-known application migration tables.
// Read only narrowly selected migration metadata; never logs, payloads or row data.
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';
const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const valid=s=>typeof s==='string'&&new RegExp(ident.pattern).test(s);
const q=s=>'"'+s.replaceAll('"','""')+'"';
const required=['projectId','branchId','endpointId','databaseName','roleName'];
const base=defineReadTool('neon_schema_list_migrations',
 'Read Prisma, Drizzle, Knex, Flyway or golang-migrate history and missing expected names without applying migrations.',
 {projectId:readId,branchId:readId,endpointId:readId,
  databaseName:ident,roleName:ident,schemaName:ident,
  expected:{type:'array',maxItems:100,uniqueItems:true,
   items:{type:'string',minLength:1,maxLength:128}}},{area:'schema'});
export const tools=[{...base,inputSchema:{...base.inputSchema,required}}];
export const MIGRATION_CATALOG_SQL=
 'SELECT n.nspname AS schema_name,c.relname AS table_name,'+
 ' a.attname AS column_name FROM pg_catalog.pg_class c'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 ' JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid'+
 " WHERE c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped"+
 " AND c.relname IN ('_prisma_migrations','__drizzle_migrations',"+
 " 'knex_migrations','flyway_schema_history','schema_migrations')"+
 " AND n.nspname NOT IN ('pg_catalog','information_schema')"+
 " AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'"+
 ' AND ($1::text IS NULL OR n.nspname=$1)'+
 ' ORDER BY n.nspname,c.relname,a.attnum LIMIT 201';
export const MIGRATION_KINDS=Object.freeze({
 _prisma_migrations:{kind:'prisma',
  columns:['migration_name','started_at','finished_at','rolled_back_at'],
  select:"migration_name::text AS name,CASE WHEN rolled_back_at IS NOT NULL"+
   " THEN 'rolled_back' WHEN finished_at IS NOT NULL THEN 'applied'"+
   " ELSE 'failed' END AS status,"+
   ' COALESCE(finished_at,started_at)::text AS observed_at',
  order:'started_at',comparable:true},
 __drizzle_migrations:{kind:'drizzle',
  columns:['id','hash','created_at'],
  select:"id::text AS name,'applied'::text AS status,"+
   ' created_at::text AS observed_at',order:'id',comparable:false},
 knex_migrations:{kind:'knex',
  columns:['id','name','migration_time'],
  select:"name::text AS name,'applied'::text AS status,"+
   ' migration_time::text AS observed_at',order:'id',comparable:true},
 flyway_schema_history:{kind:'flyway',
  columns:['installed_rank','script','installed_on','success'],
  select:"script::text AS name,CASE WHEN success THEN 'applied'"+
   " ELSE 'failed' END AS status,installed_on::text AS observed_at",
  order:'installed_rank',comparable:true},
 schema_migrations:{kind:'golang-migrate',
  columns:['version','dirty'],
  select:"version::text AS name,CASE WHEN dirty THEN 'failed'"+
   " ELSE 'applied' END AS status,NULL::text AS observed_at",
  order:'version',comparable:false}
});
export function migrationSelect(schema,table){
 if(!valid(schema)||schema.startsWith('pg_')||
    !Object.hasOwn(MIGRATION_KINDS,table))throw Error('Unsupported migration source');
 const item=MIGRATION_KINDS[table];
 return 'SELECT '+item.select+' FROM '+q(schema)+'.'+q(table)+
  ' ORDER BY '+q(item.order)+' DESC LIMIT 201';
}
const complete=r=>r?.done===true&&r.truncated===false&&
 r.cellsCapped!==true&&r.columnsCapped!==true&&
 Array.isArray(r.rows)&&r.rows.length===r.rowCount&&r.rows.length<=200;
export function createMigrationHistoryHandlers({verifyTarget=verifyConnectionTarget,
 contextFor=createProjectWriteContext,runQuery=runPublicSqlQuery}={}){
 return {async neon_schema_list_migrations(a,c){
  if(a?.schemaName!==undefined&&(!valid(a.schemaName)||
      a.schemaName.startsWith('pg_')||a.schemaName==='information_schema')||
     a?.expected!==undefined&&(!Array.isArray(a.expected)||
      a.expected.length>100||new Set(a.expected).size!==a.expected.length||
      a.expected.some(x=>typeof x!=='string'||x.length<1||x.length>128)))
   throw Error('Select an optional non-system schema and distinct expected migration names');
  const v=await verifyTarget(a,c);
  if(v.pid!==a.projectId||v.bid!==a.branchId||
     v.endpointId!==a.endpointId||v.database!==a.databaseName||
     v.role!==a.roleName||typeof v.endpoint?.host!=='string')
   throw Error('Unverified migration connection identity');
  const ctx=await contextFor(c),target={projectId:v.pid,branchId:v.bid,
   endpointId:v.endpointId,expectedEndpointHost:v.endpoint.host,
   database:v.database,role:v.role,pooled:false};
  const run=(text,params=[])=>runQuery({ctx,target,text,params});
  const found=await run(MIGRATION_CATALOG_SQL,[a.schemaName??null]);
  if(!complete(found))
   return readText({done:false,complete:false,code:'migration_catalog_incomplete'});
  const sources=new Map();
  for(const row of found.rows){
   if(!valid(row?.schema_name)||row.schema_name.startsWith('pg_')||
      !Object.hasOwn(MIGRATION_KINDS,row.table_name)||
      !valid(row.column_name))
    return readText({done:false,complete:false,code:'migration_catalog_invalid'});
   const key=row.schema_name+'.'+row.table_name;
   if(!sources.has(key))sources.set(key,{schemaName:row.schema_name,
    tableName:row.table_name,columns:new Set()});
   sources.get(key).columns.add(row.column_name);
  }
  if(sources.size>10)
   return readText({done:false,complete:false,code:'too_many_migration_sources'});
  const output=[];
  for(const source of sources.values()){
   const d=MIGRATION_KINDS[source.tableName];
   if(d.columns.some(x=>!source.columns.has(x)))
    return readText({done:false,complete:false,code:'unsupported_migration_columns',
     schemaName:source.schemaName,kind:d.kind});
   const evidence=await run(migrationSelect(source.schemaName,source.tableName));
   if(!complete(evidence))
    return readText({done:false,complete:false,code:'migration_history_incomplete'});
   const migrations=[];
   const names=new Set();
   for(const row of evidence.rows){
    if(typeof row?.name!=='string'||row.name.length<1||row.name.length>128||
       !['applied','failed','rolled_back'].includes(row.status)||
       row.observed_at!==null&&typeof row.observed_at!=='string')
     return readText({done:false,complete:false,code:'migration_row_invalid'});
    if(names.has(row.name))
     return readText({done:false,complete:false,code:'duplicate_migration_name'});
    names.add(row.name);
    migrations.push({name:row.name,status:row.status,
     observedAt:row.observed_at});
   }
   output.push({schemaName:source.schemaName,kind:d.kind,
    observedCount:migrations.length,migrations,
    missingExpected:d.comparable?(a.expected??[]).filter(x=>!names.has(x)):null,
    expectedNamesComparable:d.comparable});
  }
  if(JSON.stringify(output).length>24000)
   return readText({done:false,complete:false,code:'migration_output_too_large'});
  return readText({done:true,complete:true,sources:output,
   sourceCount:output.length,anyFailed:output.some(x=>
    x.migrations.some(y=>y.status==='failed')),
   caveat:'Only recognized migration metadata is read. Missing expected names are shown only for tools with comparable names; this tool never resolves or applies migrations.'});
 }};
}
export const handlers=createMigrationHistoryHandlers();
