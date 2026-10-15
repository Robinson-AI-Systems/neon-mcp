// V-4: admit only complete owner-supplied masking rules for verified,
// bounded metadata. Source application rows are never read or returned.
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const PRESETS=Object.freeze({
 email:'anon.fake_email()',
 text:'anon.random_string(16)'
});
const TEXT=new Set(['text','varchar','bpchar','citext','name']);
const SENSITIVE=/(?:email|phone|name|address|street|city|zip|postal|ssn|dob|birth|ip|token|password|secret|note|credential|api_key|credit|payment|owner|profile|message|comment|payload)/i;
const UNSAFE=new Set(['json','jsonb','bytea','inet','cidr','macaddr']);
export const MASK_COLUMNS_SQL='SELECT n.nspname AS schema_name,'+
 ' c.relname AS table_name,a.attname AS column_name,t.typname AS data_type'+
 ' FROM pg_catalog.pg_class c'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 ' JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid'+
 ' AND a.attnum>0 AND NOT a.attisdropped'+
 ' JOIN pg_catalog.pg_type t ON t.oid=a.atttypid'+
 " WHERE n.nspname NOT IN ('information_schema','pg_catalog') AND"+
 " n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')"+
 ' ORDER BY n.nspname,c.relname,a.attnum LIMIT 501';
export const MASK_PRESETS=Object.keys(PRESETS);
const deny=()=>{throw Error('Incomplete or unsupported safe masking policy');};
const identifier=s=>typeof s==='string'&&IDENT.test(s)&&!s.startsWith('pg_');
const key=r=>[r.schema_name??r.schemaName,r.table_name??r.tableName,
 r.column_name??r.columnName].join('.');
export function maskCatalog(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>500)deny();
 const seen=new Set(),found=[];
 for(const row of rows){
  const schema=row?.schema_name,table=row?.table_name,column=row?.column_name;
  const type=row?.data_type;
  if(!identifier(schema)||!identifier(table)||!identifier(column)||
     typeof type!=='string'||!IDENT.test(type))deny();
  const k=key(row);if(seen.has(k))deny();
  seen.add(k);
  const marked=TEXT.has(type)||SENSITIVE.test(column)||UNSAFE.has(type);
  found.push({schema_name:schema,table_name:table,column_name:column,
   data_type:type,marked});
 }
 return found;
}
export function compileMaskPlan({rows,rules,unmasked=[],databaseName,requestKey}={}){
 if(!identifier(databaseName)||!/^rmcp_[a-z0-9_]{5,128}$/.test(requestKey||''))deny();
 const catalog=maskCatalog(rows);
 if(!Array.isArray(rules)||!rules.length||rules.length>100||
    !Array.isArray(unmasked)||unmasked.length>100)deny();
 const seen=new Set(),passed=new Set(),masked=[];
 for(const rule of rules){
  if(!rule||!identifier(rule.schemaName)||!identifier(rule.tableName)||
     !identifier(rule.columnName)||!Object.keys(PRESETS).includes(rule.preset))deny();
  const k=key(rule);if(seen.has(k))deny();
  seen.add(k);
  const source=catalog.find(x=>key(x)===k);
  if(!source||!source.marked||!TEXT.has(source.data_type)||
     rule.preset==='email'&&!/email/i.test(source.column_name))deny();
  passed.add(k);
  masked.push({database_name:databaseName,
   schema_name:source.schema_name,table_name:source.table_name,
   column_name:source.column_name,masking_function:PRESETS[rule.preset]});
 }
 for(const item of unmasked){
  // Unmasking is never allowed for detected sensitive metadata.
  if(!item||!identifier(item.schemaName)||!identifier(item.tableName)||
     !identifier(item.columnName))deny();
  const k=key(item),col=catalog.find(x=>key(x)===k);
  if(!col||col.marked||passed.has(k)||seen.has(k))deny();
  seen.add(k);
 }
 if(catalog.some(x=>x.marked&&!passed.has(key(x))))deny();
 const ordered=masked.sort((a,b)=>key({
  schema_name:a.schema_name,table_name:a.table_name,
  column_name:a.column_name}).localeCompare(key({
   schema_name:b.schema_name,table_name:b.table_name,
   column_name:b.column_name})));
 const fingerprint=hash(JSON.stringify({databaseName,catalog,rules:ordered,
  unmasked,policy:'V-4-1'}));
 return {fingerprint,columnsChecked:catalog.length,maskedColumns:ordered.length,
  tableCount:new Set(catalog.map(x=>x.schema_name+'.'+x.table_name)).size,
  rules:ordered};
}
