// V-2: existing development-schema seeding. Only bounded, proven catalog shapes
// are supported. Unsupported constraints are a refusal, not a guessed write.
import {createHash} from 'node:crypto';
import {quoteIdent} from '../neon/sql-ident.js';

const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const KEY=/^rmcp_[a-z0-9_]{5,128}$/;
const q=quoteIdent;
const qualified=(schema,table)=>q(schema)+'.'+q(table);
const digest=s=>createHash('sha256').update(s).digest('hex');
const deny=()=>{throw Error('Existing schema is not a verified safe six-table seed target');};
const MAX_PARAM=8192;
const MAX_STATEMENTS=20;

// Every catalog SELECT is constant, bounded, read-only, and takes the schema as
// a bind. Application row values, defaults, policies and check expressions are
// never returned to MCP tools or persisted in a write audit.
export const AUTO_TABLES_SQL=`SELECT c.relname AS table_name, c.oid::text AS relation_oid
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=$1 AND c.relkind='r'
 ORDER BY c.relname LIMIT 7`;
export const AUTO_COLUMNS_SQL=`SELECT c.relname AS table_name, a.attname AS column_name,
 t.typname AS data_type, a.attnotnull AS required, a.attidentity AS identity,
 a.attgenerated AS generated, a.atttypmod AS type_modifier
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 JOIN pg_type t ON t.oid=a.atttypid
 WHERE n.nspname=$1 AND c.relkind='r'
 ORDER BY c.relname,a.attnum LIMIT 201`;
export const AUTO_CONSTRAINTS_SQL=`SELECT c.relname AS table_name, con.contype AS kind,
 pg_get_constraintdef(con.oid,true) AS definition,
 r.relname AS referenced_table,
 array_to_json(ARRAY(SELECT a.attname FROM unnest(con.conkey)
 WITH ORDINALITY AS k(n,ord) JOIN pg_attribute a
 ON a.attrelid=c.oid AND a.attnum=k.n ORDER BY k.ord))::text AS columns_json,
 array_to_json(ARRAY(SELECT a.attname FROM unnest(con.confkey)
 WITH ORDINALITY AS k(n,ord) JOIN pg_attribute a
 ON a.attrelid=con.confrelid AND a.attnum=k.n ORDER BY k.ord))::text AS references_json
 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_class r ON r.oid=con.confrelid
 WHERE n.nspname=$1 AND c.relkind='r'
 ORDER BY c.relname,con.conname LIMIT 201`;
export const AUTO_UNSAFE_SQL=`SELECT c.relname AS table_name
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=$1 AND c.relkind='r'
 AND (c.relrowsecurity OR c.relforcerowsecurity OR
 EXISTS (SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal) OR
 EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisunique
 AND NOT EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conindid=i.indexrelid)))
 LIMIT 1`;

function checkName(name) {
 if(typeof name!=='string'||!IDENT.test(name)||/^(?:pg_|rmcp_)/i.test(name)||
    name==='information_schema')deny();
 return name;
}
function onlyRows(rows,max) {
 if(!Array.isArray(rows)||rows.length>max||rows.some(r=>!r||typeof r!=='object'))deny();
 return rows;
}
function parseNames(value){
 let v;
 try{v=JSON.parse(value);}catch{deny();}
 if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!IDENT.test(x)))deny();
 return v;
}
function compiledCheck(definition,cols){
 if(typeof definition!=='string')deny();
 let body=/^CHECK\s*\((.*)\)$/is.exec(definition)?.[1]?.trim();
 if(!body)deny();
 while(body[0]==='('&&body.at(-1)===')')body=body.slice(1,-1).trim();
 const matched=/^"?([A-Za-z_][A-Za-z0-9_]*)"?\s*(>=|<=|>|<|=)\s*(-?\d+)$/.exec(body);
 if(!matched||!cols.some(c=>c.name===matched[1]&&c.type==='int4'))deny();
 const [,column,op,number]=matched,value=Number(number);
 if(!Number.isSafeInteger(value))deny();
 return row=>{
  if(row[column]===null)return true;
  const a=row[column];
  return op==='>='?a>=value:op==='>'?a>value:op==='<='?a<=value:
   op==='<'?a<value:a===value;
 };
}
function typeOf(row){
 const value=row.data_type;
 if(!['int4','text','varchar','bpchar','bool','date','numeric','timestamptz'].includes(value))deny();
 if(typeof row.generated!=='string'||row.generated!==''||
    !['','d'].includes(row.identity)||typeof row.required!=='boolean')deny();
 if(!Number.isSafeInteger(row.type_modifier))deny();
 const maxLen=['varchar','bpchar'].includes(value)?row.type_modifier-4:null;
 if(maxLen!==null&&(maxLen<1||maxLen>1048576))deny();
 return {name:checkName(row.column_name),type:value,required:row.required,maxLen};
}
function catalogModel({schema,tables,columns,constraints,unsafe}){
 checkName(schema);
 onlyRows(tables,7);onlyRows(columns,201);onlyRows(constraints,201);
 if(tables.length<1||tables.length>6||unsafe.length)deny();
 const byName=new Map();
 for(const row of tables){
  const name=checkName(row.table_name);
  if(byName.has(name)||!/^\d+$/.test(row.relation_oid||''))deny();
  byName.set(name,{name,oid:row.relation_oid,columns:[],foreign:[],checks:[],unique:new Set()});
 }
 for(const row of columns){
  const table=byName.get(row.table_name);if(!table)deny();
  table.columns.push(typeOf(row));
  if(table.columns.length>16||new Set(table.columns.map(c=>c.name)).size!==table.columns.length)deny();
 }
 for(const row of constraints){
  const table=byName.get(row.table_name);if(!table)deny();
  const keys=parseNames(row.columns_json);
  if(row.kind==='p'||row.kind==='u'){
   if(keys.length!==1)deny();
   table.unique.add(keys[0]);
   if(row.kind==='p'&&keys[0]!=='id')deny();
  }else if(row.kind==='f'){
   const ref=parseNames(row.references_json);
   if(keys.length!==1||ref.length!==1||ref[0]!=='id'||
      !byName.has(row.referenced_table)||row.referenced_table===table.name)deny();
   table.foreign.push({column:keys[0],parent:row.referenced_table});
  }else if(row.kind==='c'){
   table.checks.push(compiledCheck(row.definition,table.columns));
  }else deny();
 }
 for(const table of byName.values()){
  if(table.columns.length<2||!table.unique.has('id')||
     table.columns[0].name!=='id'||table.columns[0].type!=='int4'||
     table.foreign.length>8||
     table.foreign.some(f=>!table.columns.some(c=>c.name===f.column&&c.type==='int4'))||
     table.columns.some(c=>c.name.endsWith('_id')&&c.name!=='id'&&
       !table.foreign.some(f=>f.column===c.name)))deny();
 }
 const pending=new Map(byName),ordered=[];
 while(pending.size){
  let progressed=false;
  for(const [name,table] of pending){
   if(table.foreign.every(f=>!pending.has(f.parent))){
    ordered.push(table);pending.delete(name);progressed=true;
   }
  }
  if(!progressed)deny(); // cyclic or unverified dependencies
 }
 return ordered;
}
const normalized=value=>value instanceof Date?value.toISOString().slice(0,10):
 typeof value==='bigint'?value.toString():value;
function syntheticValue(column,table,rowIndex,hash,base){
 const name=column.name,i=rowIndex+1;
 if(name==='id')return base+i;
 if(table.foreign.some(f=>f.column===name))return base+i;
 if(column.type==='int4')return name.endsWith('_cents')?1200+i:
  name==='quantity'?i:100+i;
 if(column.type==='bool')return false;
 if(column.type==='date')return '2024-01-'+String(i%28+1).padStart(2,'0');
 if(column.type==='timestamptz')return '2024-01-01T00:00:00.000Z';
 if(column.type==='numeric')return String(1200+i);
 let value;
 if(name.includes('email'))value='synthetic-'+hash+'-'+i+'@example.com';
 else if(name.includes('phone'))value='+1-202-555-01'+String(i%100).padStart(2,'0');
 else if(name==='status')value='active';
 else value='Sample-'+hash+'-'+table.name+'-'+i;
 if(column.maxLen!==null&&value.length>column.maxLen){
  if(name.includes('email')||name.includes('phone')||name==='status')deny();
  value=('s'+hash+i).slice(0,column.maxLen);
 }
 return value;
}
function entriesFor(table,count,requestKey,base){
 const hash=digest(requestKey).slice(0,8),rows=[];
 for(let at=0;at<count;at++){
  const row=Object.fromEntries(table.columns.map(c=>
   [c.name,syntheticValue(c,table,at,hash,base)]));
  rows.push(row);
 }
 return rows;
}
function limitedBatches(rows,columns){
 const batches=[];let current=[];
 for(const row of rows){
  const entry=columns.map(x=>row[x.name]);
  const payload=JSON.stringify([...current,entry]);
  if(Buffer.byteLength(payload)>MAX_PARAM){
   if(!current.length)deny();
   batches.push(current);current=[];
  }
  current.push(entry);
 }
 if(current.length)batches.push(current);
 return batches;
}
async function existingConflicts(query,schema,table,rows){
 const rejected=new Set();
 for(const key of table.unique){
  if(!table.columns.some(c=>c.name===key))deny();
  for(let at=0;at<rows.length;at+=30){
   const chunk=rows.slice(at,at+30).map(row=>({
    id:row.id,value:String(row[key])
   }));
   const sql='SELECT candidate.value->>\'id\' AS candidate_id '+
    'FROM jsonb_array_elements($1::jsonb) AS candidate(value) '+
    'WHERE EXISTS (SELECT 1 FROM '+qualified(schema,table.name)+
    ' AS existing WHERE existing.'+q(key)+
    '::text = candidate.value->>\'value\') LIMIT 101';
   const found=onlyRows(await query(sql,[JSON.stringify(chunk)]),100);
   for(const hit of found){
    const candidate=Number(hit.candidate_id);
    if(!chunk.some(x=>x.id===candidate))deny();
    rejected.add(candidate);
   }
  }
 }
 return rejected;
}
export async function compileAutoSeed({existingSchema,rowsPerTable=3,requestKey,query}={}){
 if(typeof query!=='function'||!KEY.test(requestKey||'')||
    !Number.isSafeInteger(rowsPerTable)||rowsPerTable<1||rowsPerTable>100)deny();
 const schema=checkName(existingSchema);
 const [tables,columns,constraints,unsafe]=await Promise.all([
  query(AUTO_TABLES_SQL,[schema]),query(AUTO_COLUMNS_SQL,[schema]),
  query(AUTO_CONSTRAINTS_SQL,[schema]),query(AUTO_UNSAFE_SQL,[schema])
 ]);
 const ordered=catalogModel({schema,tables,columns,constraints,unsafe:onlyRows(unsafe,1)});
 const base=10000000+parseInt(digest(requestKey).slice(0,6),16)*100;
 const skipped=new Map(),prepared=[];
 for(const table of ordered){
  const candidates=entriesFor(table,rowsPerTable,requestKey,base);
  const conflicts=await existingConflicts(query,schema,table,candidates);
  const uniqueSeen=new Map(),accepted=[];
  for(const row of candidates){
   const ordinal=row.id-base;
   const invalid=conflicts.has(row.id)||
    table.foreign.some(f=>skipped.get(f.parent)?.has(ordinal))||
    table.checks.some(test=>!test(row))||
    [...table.unique].some(key=>{
     const value=String(row[key]),values=uniqueSeen.get(key)??new Set();
     if(values.has(value))return true;
     return false;
    });
   if(invalid){if(!skipped.has(table.name))skipped.set(table.name,new Set());
    skipped.get(table.name).add(ordinal);continue;}
   for(const key of table.unique){
    if(!uniqueSeen.has(key))uniqueSeen.set(key,new Set());
    uniqueSeen.get(key).add(String(row[key]));
   }
   accepted.push(row);
  }
  prepared.push({...table,rows:accepted,skipped:rowsPerTable-accepted.length});
 }
 const statements=[],params=[],expectedAffectedRows=[];
 for(const table of prepared){
  for(const batch of limitedBatches(table.rows,table.columns)){
   const keys=table.columns;
   const types=keys.map((col,i)=>'(item.value ->> '+i+')::'+
    ({int4:'integer',text:'text',varchar:'text',bpchar:'text',
     bool:'boolean',date:'date',numeric:'numeric',timestamptz:'timestamptz'})[col.type]);
   statements.push('INSERT INTO '+qualified(schema,table.name)+' ('+
    keys.map(c=>q(c.name)).join(',')+') SELECT '+types.join(',')+
    ' FROM jsonb_array_elements($1::jsonb) AS item(value) ON CONFLICT DO NOTHING');
   params.push([JSON.stringify(batch)]);expectedAffectedRows.push(batch.length);
  }
 }
 if(statements.length>MAX_STATEMENTS||!statements.length)deny();
 const totalRows=prepared.reduce((n,t)=>n+t.rows.length,0);
 const totalSkipped=prepared.reduce((n,t)=>n+t.skipped,0);
 const compact=prepared.map(t=>({name:t.name,oid:t.oid,
  columns:t.columns,rows:t.rows,skipped:t.skipped,
  foreign:t.foreign}));
 const fingerprint=digest(JSON.stringify({schema,compact,params}));
 return {mode:'auto',schema,rowsPerTable,totalRows,totalSkipped,
  tableCount:prepared.length,tables:compact,
  statements,params,expectedAffectedRows,fingerprint};
}
export async function verifyAutoSeed({plan,query}={}){
 if(!plan||typeof query!=='function'||!Array.isArray(plan.tables)||
    plan.tables.length<1||plan.tables.length>6)return false;
 for(const table of plan.tables){
  if(!table.rows.length)continue;
  const ids=table.rows.map(r=>r.id);
  const sql='SELECT '+table.columns.map(c=>q(c.name)).join(',')+
   ' FROM '+qualified(plan.schema,table.name)+
   ' WHERE "id" IN (SELECT (value)::integer FROM '+
   'jsonb_array_elements_text($1::jsonb) AS candidates(value)) ORDER BY "id" LIMIT 101';
  const observation=await query(sql,[JSON.stringify(ids)]);
  if(!Array.isArray(observation?.rows)||observation.rows.length!==ids.length)return false;
  for(let i=0;i<ids.length;i++){
   const actual=observation.rows[i],expected=table.rows[i];
   if(Object.keys(actual).length!==table.columns.length)return false;
   for(const col of table.columns){
    const value=normalized(actual[col.name]);
    if(value!==expected[col.name])return false;
   }
  }
 }
 return true;
}
