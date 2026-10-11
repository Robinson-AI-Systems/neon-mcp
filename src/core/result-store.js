// Scoped, secret-free result buffering. Never persist provider payloads before scrub.
import {createHash,randomBytes} from 'node:crypto';
import {scrubNeonResult} from './scrub.js';
export const RESULT_MAX_BYTES=8*1024;
export const RESULT_TTL_MS=24*60*60*1000;
const maxStoredBytes=2*1024*1024;
export function resultScope(connection){
 const {clientId,neonOrg,projectScope,mode,profile}=connection||{};
 if(typeof clientId!=='string'||!clientId||typeof neonOrg!=='string'||!neonOrg||
   !['preview','production'].includes(mode)||!['read_only','everyday','full'].includes(profile))
   throw new TypeError('Authenticated connection required for result handles');
 return createHash('sha256').update(JSON.stringify([
  clientId,neonOrg,projectScope||null,mode,profile
 ])).digest('hex');
}
export function sqlRowsCompact(rows,{rowCap=200,cellChars=500}={}){
 if(!Array.isArray(rows)||!Number.isInteger(rowCap)||rowCap<1||rowCap>5000||
   !Number.isInteger(cellChars)||cellChars<1||cellChars>500)throw new TypeError('Invalid SQL row limits');
 const slice=rows.slice(0,rowCap);
 const columns=[...new Set(slice.flatMap(row=>Object.keys(row||{})))];
 const cells=slice.map(row=>columns.map(column=>{
  const v=scrubNeonResult(row?.[column]??null);
  if(typeof v==='string'&&v.length>cellChars)return v.slice(0,cellChars)+'… [cell shortened]';
  return v;
 }));
 return {columns,rows:cells,count:cells.length,truncated:rows.length>rowCap};
}
export async function bufferOversizeResult({db,connection,toolName,value,maxBytes=RESULT_MAX_BYTES}){
 const safe=scrubNeonResult(value);
 const json=JSON.stringify(safe);
 const bytes=Buffer.byteLength(json);
 if(bytes<=maxBytes)return {value:safe,buffered:false};
 if(bytes>maxStoredBytes)throw new Error('Result exceeds the safe stored-result limit');
 if(typeof db?.saveResultHandle!=='function')throw new Error('Result storage unavailable');
 const scope=resultScope(connection);
 const handle='res_'+randomBytes(20).toString('hex');
 const summary='Large result from '+String(toolName||'Neon tool').replace(/[^a-zA-Z0-9_]/g,'').slice(0,80);
 await db.saveResultHandle({handle,connection:scope,summary,body:safe,
  expiresAt:new Date(Date.now()+RESULT_TTL_MS)});
 return {buffered:true,value:{handle,summary,bytes,expiresHours:24,
   preview:json.slice(0,500),truncated:true,
   next:'Use neon_get_result with this handle to page the stored result.'}};
}
