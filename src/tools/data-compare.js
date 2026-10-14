// D-9 branch comparison: fixed read-only catalog + bounded fingerprints.
// No caller SQL, row values, primary-key values or hashes leave the handler.
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';
import {quoteIdent} from '../neon/sql-ident.js';
import {TABLES_SQL,COLUMNS_SQL} from './schema-reads.js';
const ident={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const scope={type:'object',properties:{projectId:readId,branchId:readId,
 endpointId:readId,databaseName:ident,roleName:ident},
 required:['projectId','branchId','endpointId','databaseName','roleName'],additionalProperties:false};
const base=defineReadTool('neon_branch_compare_data',
 'Compare bounded table counts and fingerprints on two verified branches; no row values.',
 {left:scope,right:scope,schemaName:ident,tableNames:{type:'array',items:ident,
  minItems:1,maxItems:5,uniqueItems:true},rowLimit:{type:'integer',minimum:1,maximum:50000}},
 {area:'branches'});
export const tools=[{...base,inputSchema:{...base.inputSchema,
 required:['left','right','schemaName','tableNames']}}];
export const PRIMARY_KEY_SQL='SELECT a.attname AS column_name'+
 ' FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 ' CROSS JOIN LATERAL pg_catalog.unnest(i.indkey) WITH ORDINALITY AS k(attnum,ord)'+
 ' JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum'+
 ' WHERE n.nspname=$1 AND c.relname=$2 AND i.indisprimary'+
 ' ORDER BY k.ord LIMIT 201';
const valid=x=>typeof x==='string'&&new RegExp(ident.pattern).test(x)&&
 !x.startsWith('pg_')&&x!=='information_schema';
const whole=x=>x?.done===true&&x.truncated===false&&
 x.cellsCapped!==true&&x.columnsCapped!==true&&Array.isArray(x.rows)&&
 x.rowCount===x.rows.length&&x.rows.length<=200;
const digest=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
export function comparisonSql(schema,table,keys=[],rowLimit=50000){
 if(!valid(schema)||!valid(table)||!Array.isArray(keys)||
    keys.some(x=>typeof x!=='string')||!Number.isInteger(rowLimit)||rowLimit<1||rowLimit>50000)throw Error('Verified relation required');
 const relation=quoteIdent(schema)+'.'+quoteIdent(table);
 const row='pg_catalog.md5(pg_catalog.to_jsonb(t)::text)';
 return {
  count:'SELECT pg_catalog.count(*)::text AS row_count FROM '+relation+' t',
  checksum:'SELECT pg_catalog.count(*)::text AS row_count,pg_catalog.md5(COALESCE('+ 
   'pg_catalog.string_agg('+row+',\'\' ORDER BY '+row+'),\'\')) AS checksum FROM (SELECT * FROM '+relation+' LIMIT '+(rowLimit+1)+') t',
  page:keys.length?'SELECT pg_catalog.md5(pg_catalog.jsonb_build_array('+
   keys.map(k=>'t.'+quoteIdent(k)).join(',')+')::text) AS key_hash,'+row+
   ' AS row_hash FROM '+relation+' t ORDER BY key_hash LIMIT 100 OFFSET $1':null
 };
}
function count(result){
 if(!whole(result)||result.rows.length!==1||
    !/^\d+$/.test(String(result.rows[0].row_count)))throw Error('Complete count required');
 const n=Number(result.rows[0].row_count);
 if(!Number.isSafeInteger(n))throw Error('Unbounded count');return n;
}
export function compareFingerprintMaps(left,right){
 let added=0,removed=0,changed=0;
 for(const [key,value] of right){if(!left.has(key))added++;
  else if(left.get(key)!==value)changed++;}
 for(const key of left.keys())if(!right.has(key))removed++;
 return {added,removed,changed};
}
export function createDataCompareHandlers({verifyTarget=verifyConnectionTarget,
 contextFor=createProjectWriteContext,query=runPublicSqlQuery,now=Date.now}={}){
 return {async neon_branch_compare_data(a,c){
  if(!valid(a?.schemaName)||!Array.isArray(a.tableNames)||a.tableNames.length<1||
    a.tableNames.length>5||new Set(a.tableNames).size!==a.tableNames.length||
    a.tableNames.some(x=>!valid(x))||
    !Number.isInteger(a.rowLimit??50000)||(a.rowLimit??50000)<1||
    (a.rowLimit??50000)>50000)throw Error('Select safe bounded relations');
  const start=now(),ctx=await contextFor(c),sides=[];
  for(const selected of [a.left,a.right]){
   const v=await verifyTarget(selected,c);
   if(v.pid!==selected.projectId||v.bid!==selected.branchId||
    v.endpointId!==selected.endpointId||v.database!==selected.databaseName||
    v.role!==selected.roleName||typeof v.endpoint?.host!=='string')
    throw Error('Independent comparison target mismatch');
   sides.push({projectId:v.pid,branchId:v.bid,endpointId:v.endpointId,
    expectedEndpointHost:v.endpoint.host,database:v.database,role:v.role,pooled:false});
  }
  if(JSON.stringify(sides[0])===JSON.stringify(sides[1]))throw Error('Choose distinct targets');
  async function run(target,text,params=[]){
   if(now()-start>180000)throw Error('Comparison time budget exceeded');
   const r=await query({ctx,target,text,params});if(!whole(r))throw Error('Incomplete comparison read');return r;
  }
  const inventories=[];
  for(const target of sides){const r=await run(target,TABLES_SQL,[a.schemaName]);
   inventories.push(r.rows);}
  const results=[];
  for(const table of a.tableNames){
   const metadata=[];
   for(let i=0;i<2;i++){
    const rows=inventories[i].filter(x=>x.table_name===table);
    if(rows.length!==1||rows[0].relation_kind!=='r')throw Error('Verified regular table required on both sides');
    const columns=await run(sides[i],COLUMNS_SQL,[a.schemaName,table]);
    const pk=await run(sides[i],PRIMARY_KEY_SQL,[a.schemaName,table]);
    if(!columns.rows.length||columns.rows.some(x=>typeof x.column_name!=='string'||
       typeof x.data_type!=='string'||typeof x.nullable!=='boolean')||new Set(columns.rows.map(x=>x.column_name)).size!==columns.rows.length||
       pk.rows.some(x=>!columns.rows.some(y=>y.column_name===x.column_name))||
       new Set(pk.rows.map(x=>x.column_name)).size!==pk.rows.length)
     throw Error('Complete column/key inventory required');
    metadata.push({columns:columns.rows.map(x=>({name:x.column_name,type:x.data_type,
     nullable:x.nullable})),keys:pk.rows.map(x=>x.column_name)});
   }
   if(JSON.stringify(metadata[0])!==JSON.stringify(metadata[1])){
    results.push({tableName:table,complete:false,reason:'schema_mismatch'});continue;}
   const sql=comparisonSql(a.schemaName,table,metadata[0].keys,a.rowLimit??50000),counts=[];
   for(const target of sides)counts.push(count(await run(target,sql.count)));
   if(counts.some(n=>n>(a.rowLimit??50000))){
    results.push({tableName:table,leftCount:counts[0],rightCount:counts[1],
     complete:false,reason:'row_limit'});continue;}
   const before=[],maps=[];
   for(let i=0;i<2;i++){
    const first=await run(sides[i],sql.checksum);
    if(count(first)!==counts[i]||!digest(first.rows[0].checksum))throw Error('Table changed during comparison');
    before.push(first.rows[0]);const map=new Map();
    if(sql.page){for(let offset=0;offset<counts[i];offset+=100){
     const page=await run(sides[i],sql.page,[offset]);
     if(page.rows.length!==Math.min(100,counts[i]-offset))throw Error('Incomplete comparison page');
     for(const row of page.rows){if(!digest(row.key_hash)||!digest(row.row_hash)||map.has(row.key_hash))
      throw Error('Invalid or colliding fingerprints');map.set(row.key_hash,row.row_hash);}
    }}maps.push(map);
   }
   // Reobserve both sides after all pages. Separate read transactions are not
   // an atomic cross-branch snapshot; changes observed here fail closed.
   for(let i=0;i<2;i++){
    const after=await run(sides[i],sql.checksum);
    if(count(after)!==counts[i]||after.rows[0].checksum!==before[i].checksum)
     throw Error('Table changed during comparison');
   }
   results.push({tableName:table,leftCount:counts[0],rightCount:counts[1],
    complete:true,fingerprintEqual:counts[0]===counts[1]&&
     before[0].checksum===before[1].checksum,
    changes:sql.page?compareFingerprintMaps(maps[0],maps[1]):null,
    ...(!sql.page?{reason:'no_primary_key_counts_and_checksum_only'}:{})});
  }
  return readText({done:true,complete:results.every(x=>x.complete),tables:results,
   atomicSnapshot:false,warning:'Read-only observations use MD5 fingerprints and separate transactions. Hash equality is not cryptographic proof or a simultaneous snapshot. No row/key values are returned.'});
 }};
}
export const handlers=createDataCompareHandlers();
