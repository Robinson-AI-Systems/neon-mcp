// D-6: generate bounded, JSON-facing TS or Zod row types from verified catalogs.
// No DDL execution, table records, defaults, or access to arbitrary SQL text.
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';
import {TABLES_SQL,COLUMNS_SQL} from './schema-reads.js';

const identifier={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const required=['projectId','branchId','endpointId','databaseName','roleName','schemaName'];
const tool=defineReadTool('neon_schema_generate_types',
 'Generate TypeScript row interfaces or Zod schemas from verified, bounded database metadata.',
 {projectId:readId,branchId:readId,endpointId:readId,
  databaseName:identifier,roleName:identifier,schemaName:identifier,
  tableNames:{type:'array',minItems:1,maxItems:20,uniqueItems:true,
   items:identifier},format:{type:'string',enum:['typescript','zod']}},{area:'schema'});
export const tools=[{...tool,inputSchema:{...tool.inputSchema,required}}];
const validName=value=>typeof value==='string'&&
 /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(value);
const kindPrefix=Object.freeze({
 'smallint':'number','integer':'number','int':'number',
 'real':'number','double precision':'number',
 'boolean':'boolean',
 'bigint':'string','numeric':'string','decimal':'string',
 'text':'string','character varying':'string',
 'character':'string','uuid':'string','xml':'string',
 'date':'string','time without time zone':'string',
 'time with time zone':'string','timestamp without time zone':'string',
 'timestamp with time zone':'string','interval':'string',
 'inet':'string','cidr':'string','macaddr':'string','macaddr8':'string'
});
export function jsonScalarType(databaseType){
 if(typeof databaseType!=='string'||databaseType.length>128)return 'unknown';
 const s=databaseType.trim().toLowerCase();
 if(s.endsWith('[]')){
  const nested=jsonScalarType(s.slice(0,-2));
  return nested==='unknown'?'unknown[]':nested+'[]';
 }
 if(s==='json'||s==='jsonb')return 'unknown';
 if(s==='bytea')return 'unknown';
 if(s.startsWith('character varying(')||s.startsWith('varchar(')||
    s.startsWith('character(')||s.startsWith('numeric(')||s.startsWith('decimal('))
  return s.startsWith('numeric(')||s.startsWith('decimal(')?'string':'string';
 return kindPrefix[s]??'unknown';
}
const zodScalar=type=>{
 if(type.endsWith('[]'))return 'z.array('+zodScalar(type.slice(0,-2))+')';
 if(type==='number')return 'z.number()';
 if(type==='string')return 'z.string()';
 if(type==='boolean')return 'z.boolean()';
 return 'z.unknown()';
};
function modelName(table){
 const tokens=table.replace(/[^A-Za-z0-9]+/g,'_').split('_')
  .filter(Boolean).map(x=>x[0].toUpperCase()+x.slice(1));
 const raw=tokens.join('')||'Table';
 return (/^[A-Za-z_]/.test(raw)?raw:'T'+raw)+'Row';
}
export function generateSchemaSource(tables,format='typescript'){
 if(!['typescript','zod'].includes(format)||!Array.isArray(tables)||
    tables.length<1||tables.length>20)
  throw Error('Select at most twenty unique tables');
 const seenModels=new Set();
 const segments=[];
 if(format==='zod')segments.push('import { z } from "zod";');
 for(const table of tables){
  if(!validName(table?.name)||!Array.isArray(table.columns)||
     table.columns.length<1||table.columns.length>200)
   throw Error('Cannot generate a complete bound table declaration');
  const model=modelName(table.name);
  if(seenModels.has(model))throw Error('Colliding generated model names');
  seenModels.add(model);
  const seenColumns=new Set();
  const fields=[];
  for(const column of table.columns){
   const col=column?.column_name;
   if(typeof col!=='string'||col.length<1||col.length>63||
      /[\u0000-\u001f\u007f]/.test(col)||seenColumns.has(col)||
      typeof column.nullable!=='boolean'||
      !Number.isSafeInteger(column.ordinal_position)||column.ordinal_position<1)
    throw Error('Invalid or duplicated column metadata');
   seenColumns.add(col);
   const scalar=jsonScalarType(column.data_type);
   const property=JSON.stringify(col);
   if(format==='typescript')
    fields.push('  '+property+': '+scalar+
      (column.nullable?' | null':'')+';');
   else fields.push('  '+property+': '+zodScalar(scalar)+
    (column.nullable?'.nullable()':'')+',');
  }
  if(format==='typescript')
   segments.push('export interface '+model+' {\n'+fields.join('\n')+'\n}');
  else segments.push('export const '+model+'Schema = z.object({\n'+
    fields.join('\n')+'\n});\nexport type '+model+
    ' = z.infer<typeof '+model+'Schema>;');
 }
 return segments.join('\n\n')+'\n';
}
export function createSchemaTypeHandlers({
 verifyTarget=verifyConnectionTarget,contextFor=createProjectWriteContext,
 runQuery=runPublicSqlQuery}={}){
 return {async neon_schema_generate_types(args,c){
  if(!validName(args?.schemaName)||
     args.format!==undefined&&!['typescript','zod'].includes(args.format)||
     args.tableNames!==undefined&&(!Array.isArray(args.tableNames)||
      args.tableNames.length<1||args.tableNames.length>20||
      new Set(args.tableNames).size!==args.tableNames.length||
      args.tableNames.some(x=>!validName(x))))
   throw Error('An exact schema and up to twenty distinct safe table names are required');
  const v=await verifyTarget(args,c);
  if(v.pid!==args.projectId||v.bid!==args.branchId||
     v.endpointId!==args.endpointId||v.database!==args.databaseName||
     v.role!==args.roleName||typeof v.endpoint?.host!=='string')
   throw Error('Provider identity mismatch');
  const ctx=await contextFor(c),target={projectId:v.pid,branchId:v.bid,
   endpointId:v.endpointId,expectedEndpointHost:v.endpoint.host,
   database:v.database,role:v.role,pooled:false};
  const catalog=await runQuery({ctx,target,text:TABLES_SQL,
   params:[args.schemaName]});
  if(catalog?.done!==true||catalog.truncated!==false||
     catalog.cellsCapped===true||catalog.columnsCapped===true||
     !Array.isArray(catalog.rows)||catalog.rows.length!==catalog.rowCount||
     catalog.rows.length>200)
   return readText({done:false,code:'catalog_incomplete',
    message:'The table inventory was not completely verified'});
  const names=catalog.rows.map(x=>x.table_name);
  if(names.some(x=>!validName(x))||new Set(names).size!==names.length)
   return readText({done:false,code:'catalog_invalid'});
  const selected=args.tableNames??names;
  if(selected.length<1||selected.length>20||selected.some(n=>!names.includes(n)))
   return readText({done:false,code:'selection_incomplete',
    message:'Select one to twenty tables from the complete schema inventory'});
  const tables=[];
  for(const name of selected){
   const row=await runQuery({ctx,target,text:COLUMNS_SQL,
    params:[args.schemaName,name]});
   if(row?.done!==true||row.truncated!==false||
      row.cellsCapped===true||row.columnsCapped===true||
      !Array.isArray(row.rows)||row.rows.length!==row.rowCount||
      row.rows.length<1||row.rows.length>200)
    return readText({done:false,code:'columns_incomplete',
     message:'At least one table has incomplete column metadata'});
   tables.push({name,columns:row.rows});
  }
  try{
   const source=generateSchemaSource(tables,args.format??'typescript');
   if(source.length>24000)
    return readText({done:false,code:'generated_output_too_large'});
   return readText({done:true,format:args.format??'typescript',
    schemaName:args.schemaName,tableCount:tables.length,
    complete:true,source,
    note:'JSON-facing scalar types: numeric/bigint and time values are strings; database enum/domain and bytea values use unknown rather than guessing.'});
  }catch{return readText({done:false,code:'invalid_catalog_types'});}
 }};
}
export const handlers=createSchemaTypeHandlers();
