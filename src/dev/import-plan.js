// V-2 single-table public import: trusted SQL identifiers and parameters only.
// All row content is ephemeral; the durable audit records only counts and a digest.
import {createHash} from 'node:crypto';
import {quoteIdent} from '../neon/sql-ident.js';
import {parsePublicRows,normalizePublicRows} from './public-source.js';

const KEY=/^rmcp_[a-z0-9_]{5,128}$/;
const MAX_PARAM=8192;
const MAX_STMTS=20;
const unique=new Set(['email','sku','slug','serial']);
const q=quoteIdent;
const qualified=s=>q(s)+'.'+q('import_rows');
const pgType=type=>({integer:'integer',boolean:'boolean',date:'date',text:'text'})[type];
function checkedShape(sha256,requestKey){
 if(typeof sha256!=='string'||!/^[0-9a-f]{64}$/.test(sha256)||
    !KEY.test(requestKey||''))throw Error('Exact public source and stable audit key required');
}
export function compilePublicImport({source,requestKey}={}){
 checkedShape(source?.sha256,requestKey);
 const dataset=normalizePublicRows(parsePublicRows(source));
 const schema='rmcp_import_'+createHash('sha256').update(
  requestKey+'|'+source.sha256).digest('hex').slice(0,24);
 const names=dataset.columns.map(x=>x.name);
 const declarations=dataset.columns.map(c=>{
  const id=q(c.name),type=pgType(c.type);
  if(!type)throw Error('Unsupported imported data type');
  if(c.name==='id')return id+' integer PRIMARY KEY';
  return id+' '+type+(c.nullable?'':' NOT NULL')+
   (unique.has(c.name)?' UNIQUE':'')+
   (c.name==='quantity'?' CHECK ('+id+' >= 0)':
    c.name.endsWith('_cents')?' CHECK ('+id+' >= 0)':'');
 });
 // Reject conflicting constrained values before any SQL connection.
 for(const spec of dataset.columns.filter(x=>unique.has(x.name))){
  const values=dataset.rows.map(x=>x[spec.name]).filter(x=>x!==null);
  if(new Set(values).size!==values.length)
   throw Error('Imported values conflict with a unique column');
 }
 for(const row of dataset.rows)
  for(const spec of dataset.columns){
   if((spec.name==='quantity'||spec.name.endsWith('_cents'))&&
      row[spec.name]!==null&&(!(Number.isSafeInteger(row[spec.name]))||
       row[spec.name]<0))
    throw Error('Imported numeric constraints are not satisfied');
  }
 const statements=['CREATE SCHEMA '+q(schema),
  'CREATE TABLE '+qualified(schema)+' ('+declarations.join(', ')+')'];
 const params=[[],[]],expectedAffectedRows=[0,0];
 let offset=0;
 while(offset<dataset.rows.length){
  const batch=[];
  for(;offset<dataset.rows.length;offset++){
   const entry=names.map(k=>dataset.rows[offset][k]);
   const proposal=JSON.stringify([...batch,entry]);
   if(proposal.length>MAX_PARAM){
    if(!batch.length)throw Error('Imported row exceeds guarded SQL parameter ceiling');
    break;
   }
   batch.push(entry);
  }
  const expressions=dataset.columns.map((c,i)=>
   '(entry.value ->> '+i+')::'+pgType(c.type));
  statements.push('INSERT INTO '+qualified(schema)+' ('+names.map(q).join(',')+
   ') SELECT '+expressions.join(',')+
   ' FROM jsonb_array_elements($1::jsonb) AS entry(value)');
  params.push([JSON.stringify(batch)]);expectedAffectedRows.push(batch.length);
  if(statements.length>MAX_STMTS)
   throw Error('Import requires more than 20 guarded SQL statements');
 }
 if(expectedAffectedRows.reduce((a,b)=>a+b,0)!==dataset.totalRows)
  throw Error('Incomplete public import plan');
 return {schema,table:'import_rows',sourceHost:source.host,
  sourceKind:source.kind,sourceHash:source.sha256,byteLength:source.byteLength,
  totalRows:dataset.totalRows,columns:dataset.columns,rows:dataset.rows,
  statements,params,expectedAffectedRows};
}
export async function verifyPublicImport({plan,query}={}){
 if(!plan||typeof query!=='function'||plan.rows?.length<1||
    plan.rows.length>900||plan.columns?.length<2||plan.columns.length>17)
  return false;
 const names=plan.columns.map(x=>x.name);
 const text='SELECT '+names.map(q).join(',')+' FROM '+
  qualified(plan.schema)+' ORDER BY "id" LIMIT 901';
 const result=await query(text,[]);
 if(!Array.isArray(result?.rows)||result.rows.length!==plan.totalRows)return false;
 for(let i=0;i<result.rows.length;i++){
  const actual=result.rows[i],before=plan.rows[i];
  if(Object.keys(actual).length!==names.length)return false;
  for(const key of names){
   const value=actual[key] instanceof Date?actual[key].toISOString().slice(0,10):actual[key];
   if(value!==before[key])return false;
  }
 }
 return true;
}
