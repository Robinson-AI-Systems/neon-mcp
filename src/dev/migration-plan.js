// V-3 migrations: only bounded, PostgreSQL-parsed, independently classified SQL.
// Never execute on the selected target: B-3c owns the disposable child.
import {parse} from 'libpg-query';
import {classifySql} from '../neon/sql-guard.js';
import {quoteIdent} from '../neon/sql-ident.js';
import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex');
const NAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const ROOTS=new Set(['InsertStmt','UpdateStmt','DeleteStmt','CreateStmt',
 'AlterTableStmt','IndexStmt','DropStmt','RenameStmt','CreateSchemaStmt',
 'CreateEnumStmt','AlterEnumStmt','CreateSeqStmt','AlterSeqStmt']);
const LOCKS=new Set(['AlterTableStmt','DropStmt','RenameStmt']);
const deny=()=>{throw Error('Unsupported or unverified disposable migration preview');};
export const TABLE_SIZE_SQL='SELECT c.relname AS table_name,'+
 ' c.reltuples::bigint AS estimated_rows FROM pg_catalog.pg_class c'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 " WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname LIMIT 101";
export const PRISMA_SQL=schema=>
 'SELECT migration_name,finished_at::text AS finished_at,'+
 ' rolled_back_at::text AS rolled_back_at FROM '+
 quoteIdent(schema)+'."_prisma_migrations" ORDER BY started_at ASC LIMIT 101';
export function appliedPrismaRows(rows){
 if(!Array.isArray(rows)||rows.length>100)deny();
 const applied=new Set(),seen=new Set();
 for(const r of rows){
  const name=r?.migration_name;
  if(typeof name!=='string'||!NAME.test(name)||
     r.finished_at!=null&&typeof r.finished_at!=='string'||
     r.rolled_back_at!=null&&typeof r.rolled_back_at!=='string'||seen.has(name))deny();
  seen.add(name);
  if(r.finished_at!==null&&r.rolled_back_at!==null)deny();
  if(r.finished_at!==null)applied.add(name);
  else if(r.rolled_back_at===null)deny();
 }
 return applied;
}
export async function splitMigration(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>65536||!text.trim())deny();
 let ast;
 try{ast=await parse(text);}catch{deny();}
 if(!Array.isArray(ast?.stmts)||ast.stmts.length<1||ast.stmts.length>20)deny();
 const statements=[];
 for(let i=0;i<ast.stmts.length;i++){
  const item=ast.stmts[i],position=item?.stmt_location??0;
  const end=Number.isSafeInteger(item?.stmt_len)&&item.stmt_len>0?
   position+item.stmt_len:i+1<ast.stmts.length?
    ast.stmts[i+1].stmt_location:text.length;
  if(!Number.isSafeInteger(position)||!Number.isSafeInteger(end)||
     position<0||end<=position||end>text.length)deny();
  const sql=text.slice(position,end).trim().replace(/;$/,'').trim();
  if(!sql||sql.length>20000)deny();
  const names=Object.keys(item.stmt??{});
  if(names.length!==1||!ROOTS.has(names[0]))deny();
  const cls=await classifySql(sql);
  if(!['write','ddl','destructive'].includes(cls.kind)||
     cls.unknownNode===true)deny();
  statements.push({sql,root:names[0],ast:item.stmt[names[0]],
   fullTable:cls.fullTable===true});
 }
 return statements;
}
function affectedTable(s){
 if(['AlterTableStmt','RenameStmt'].includes(s.root))
  return s.ast?.relation?.relname??null;
 if(s.root==='DropStmt'){
  const first=s.ast?.objects?.[0],last=Array.isArray(first)?first.at(-1):null;
  return last?.String?.sval??last?.str??null;
 }
 return null;
}
export function lockingWarnings(statements,sizes,threshold=100000){
 if(!Number.isSafeInteger(threshold)||threshold<1000||threshold>1000000000||
    !Array.isArray(sizes)||sizes.length>100||
    sizes.some(r=>!IDENT.test(r?.table_name||'')||
      !Number.isSafeInteger(Number(r.estimated_rows))||
      Number(r.estimated_rows)<-1))deny();
 const counts=new Map(sizes.map(r=>[r.table_name,Number(r.estimated_rows)]));
 if(counts.size!==sizes.length)deny();
 const warnings=[];
 for(let i=0;i<statements.length;i++){
  const s=statements[i];if(!LOCKS.has(s.root))continue;
  const name=affectedTable(s),count=counts.get(name)??null;
  if(count===null||count>=threshold)warnings.push({
   statement:i+1,table:IDENT.test(name||'')?name:null,
   estimatedRows:count,reason:count===null?
    'Potential ACCESS EXCLUSIVE lock; table size unknown':
    'Potential ACCESS EXCLUSIVE lock on a large table'});
 }
 return warnings;
}
export async function compileMigrationPreview({args,requestKey,loadApplied,
 fetchFile,loadSizes,lockWarnRows=100000}={}){
 if(!/^rmcp_[a-z0-9_]{5,128}$/.test(requestKey||'')||
    typeof loadSizes!=='function')deny();
 const schema=args?.schemaName??'public';
 if(!IDENT.test(schema)||schema.startsWith('pg_')||
    schema==='information_schema')deny();
 const files=args?.migrations,inline=args?.statements;
 if((files!==undefined)===(inline!==undefined))deny();
 let appliedNames=[],selected=[];
 if(files!==undefined){
  if(!Array.isArray(files)||files.length<1||files.length>10||
     typeof fetchFile!=='function'||typeof loadApplied!=='function')deny();
  const seen=new Set();
  for(const item of files){
   if(!NAME.test(item?.name||'')||seen.has(item.name)||
      typeof item.url!=='string'||item.url.length<12||item.url.length>2048||
      !item.url.toLowerCase().split('?')[0].endsWith('.sql'))deny();
   seen.add(item.name);
  }
  const applied=appliedPrismaRows(await loadApplied(schema));
  // Validate every applied/pending boundary before any external source is fetched.
  let missing=false;
  for(const item of files){
   if(applied.has(item.name)){
    if(missing)deny();
    appliedNames.push(item.name);
   }else missing=true;
  }
  for(const item of files)
   if(!applied.has(item.name))
    selected.push({name:item.name,source:await fetchFile(item.url)});
 }else{
  if(!Array.isArray(inline)||inline.length<1||inline.length>20||
     inline.some(x=>typeof x!=='string'||x.length<1||x.length>20000))deny();
  selected=inline.map((text,i)=>({name:'inline_'+(i+1),
   source:{text,sha256:digest(text),kind:'sql'}}));
 }
 if(!selected.length)deny();
 let parsed=[],bytes=0;
 for(const item of selected){
  if(item.source?.kind!=='sql'||typeof item.source.text!=='string'||
     item.source.sha256!==digest(item.source.text))deny();
  bytes+=Buffer.byteLength(item.source.text);
  if(bytes>65536)deny();
  const statements=await splitMigration(item.source.text);
  parsed.push(...statements.map(s=>({...s,migration:item.name})));
  if(parsed.length>20)deny();
 }
 const sizes=await loadSizes(schema);
 const warnings=lockingWarnings(parsed,sizes,lockWarnRows);
 const statements=parsed.map(s=>s.sql);
 const summary=parsed.map(s=>({migration:s.migration,root:s.root,
  fullTable:s.fullTable}));
 const fingerprint=digest(JSON.stringify({requestKey,schema,appliedNames,
  digests:selected.map(x=>[x.name,x.source.sha256]),statements,
  sizes,warnings,lockWarnRows,version:'V-3:1'}));
 return {mode:files?'public-migrations':'inline',schema,
  filenames:selected.map(x=>x.name),alreadyApplied:appliedNames,
  summary,warnings,statements,params:statements.map(()=>[]),
  fingerprint,lockWarnRows,anyFullTable:parsed.some(x=>x.fullTable)};
}
