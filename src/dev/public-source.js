// V-2 public CSV/JSON: pinned public IPv4 HTTPS transport, no redirects or proxies.
// This file never accepts caller SQL or Neon credentials.
import https from 'node:https';
import {lookup as nodeLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';

const MAX_BYTES=10*1024*1024;
const MAX_ROWS=900; // 2 DDL + 18 parameterized 50-row inserts under B-3's 20-statement cap.
const MAX_COLUMNS=16;
const MAX_CELL=256;
const COLUMN=/^[a-z][a-z0-9_]{0,40}$/;
const DENIED_COLUMN=/(^|_)(?:ssn|password|secret|token|private_key|dob|birth|address|street)(?:_|$)/;
const ISO_DATE=/^\d{4}-\d\d-\d\d$/;
const SAFE_EMAIL=/^[^\s@]{1,80}@example\.com$/i;

export function isPublicIPv4(ip){
 if(isIP(ip)!==4)return false;
 const [a,b,c]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||
  a===100&&b>=64&&b<=127||a===169&&b===254||
  a===172&&b>=16&&b<=31||a===192&&(
   b===168||b===0||b===0&&c===2||b===88&&c===99)||
  a===198&&(b===18||b===19||b===51&&c===100)||
  a===203&&b===0&&c===113);
}
export function checkedPublicSource(raw){
 if(typeof raw!=='string'||raw.length<12||raw.length>2048)
  throw Error('Provide one bounded HTTPS CSV or JSON URL');
 let url;
 try{url=new URL(raw);}catch{throw Error('Invalid public file URL');}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||
    url.port&&url.port!=='443'||url.hash||
    !/^[a-z0-9.-]+$/.test(host)||isIP(host)!==0||
    host==='localhost'||host.endsWith('.localhost')||
    ['.local','.internal','.test','.invalid','.onion'].some(x=>host.endsWith(x))||
    host.split('.').length<2)
  throw Error('Public-file HTTPS host refused');
 const kind=url.pathname.toLowerCase().endsWith('.csv')?'csv':
  url.pathname.toLowerCase().endsWith('.json')?'json':null;
 if(!kind)throw Error('Public URL must point to a CSV or JSON file');
 return {url,host,kind};
}
/** All connections are TLS-verified against the original hostname, and DNS
 * is pinned to a prevalidated public address. Responses never redirect. */
export async function fetchPublicSource(raw,{resolve=nodeLookup,request=https.request}={}){
 const {url,host,kind}=checkedPublicSource(raw);
 let answers;
 try{answers=await resolve(host,{all:true});}
 catch{throw Error('Public-file DNS validation failed');}
 if(!Array.isArray(answers)||!answers.length||
    answers.some(x=>x.family===4&&!isPublicIPv4(x.address)))
  throw Error('Public-file host does not resolve safely');
 const chosen=answers.find(x=>x.family===4&&isPublicIPv4(x.address))?.address;
 if(!chosen)throw Error('Public HTTPS URL needs a public IPv4 address');
 const buffer=await new Promise((ok,fail)=>{
  let finished=false,total=0;
  const done=(error,value)=>{
   if(finished)return;finished=true;
   if(error)fail(new Error('Public-file download was refused or incomplete'));
   else ok(value);
  };
  let req;
  try{
   req=request(url,{agent:false,timeout:10000,
    lookup:(_host,_options,callback)=>callback(null,chosen,4),
    headers:{Accept:'application/json,text/csv,text/plain'},
    maxHeaderSize:16384},res=>{
    if(res.statusCode!==200||
       res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'||
       Number(res.headers['content-length']||0)>MAX_BYTES){
     res.destroy();done(Error('Unacceptable public file response'));return;
    }
    const chunks=[];
    res.on('data',part=>{
     const item=Buffer.from(part);total+=item.length;
     if(total>MAX_BYTES){res.destroy();done(Error('File exceeds cap'));return;}
     chunks.push(item);
    });
    res.on('end',()=>done(null,Buffer.concat(chunks,total)));
    res.on('error',error=>done(error));
    res.on('aborted',()=>done(Error('Incomplete response')));
   });
   req.on('timeout',()=>req.destroy(Error('HTTPS download timed out')));
   req.on('error',error=>done(error));
   req.end();
  }catch(error){done(error);}
 });
 let text;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}
 catch{throw Error('Public-file body must be UTF-8');}
 return {host,kind,text,sha256:createHash('sha256').update(buffer).digest('hex'),
  byteLength:buffer.length};
}
export function parseCsv(text){
 if(typeof text!=='string'||text.length>MAX_BYTES)throw Error('CSV size invalid');
 const rows=[];let row=[],field='',quoted=false,started=false;
 function fieldEnd(){
  if(field.length>MAX_CELL)throw Error('CSV field exceeds the limit');
  row.push(field);field='';started=false;
  if(row.length>MAX_COLUMNS)throw Error('CSV has too many columns');
 }
 function rowEnd(){
  fieldEnd();rows.push(row);row=[];
  if(rows.length>MAX_ROWS+1)throw Error('CSV has too many rows');
 }
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
   else if(ch==='"'){quoted=false;}
   else field+=ch;
  }else if(ch==='"'&&!started&&!field){quoted=true;started=true;}
  else if(ch==='"')throw Error('Invalid CSV quoting');
  else if(ch===',')fieldEnd();
  else if(ch==='\n'){rowEnd();}
  else if(ch==='\r'){
   if(text[i+1]!=='\n')throw Error('CSV requires CRLF or LF lines');
  }else{field+=ch;started=true;}
  if(field.length>MAX_CELL)throw Error('CSV field exceeds the limit');
 }
 if(quoted)throw Error('Unterminated CSV quote');
 if(field.length||row.length||started)rowEnd();
 if(rows.length<2)throw Error('CSV requires a header and at least one data row');
 const header=rows.shift().map((x,i)=>i===0?x.replace(/^\uFEFF/,''):x);
 if(new Set(header).size!==header.length||header.length<1)throw Error('Invalid CSV header');
 return rows.map(values=>{
  if(values.length!==header.length)throw Error('CSV row has inconsistent fields');
  return Object.fromEntries(header.map((key,i)=>[key,values[i]]));
 });
}
export function parsePublicRows({kind,text}={}){
 let rows;
 if(kind==='csv')rows=parseCsv(text);
 else if(kind==='json'){
  try{rows=JSON.parse(text);}catch{throw Error('Invalid public JSON');}
 }else throw Error('Unsupported public file type');
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_ROWS||
    rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)))
  throw Error('Public file must contain a bounded array of simple row objects');
 return rows;
}
function isIsoDay(x){
 if(typeof x!=='string'||!ISO_DATE.test(x))return false;
 const n=Date.parse(x+'T00:00:00Z');
 return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===x;
}
function safeCell(key,x){
 if(x===null)return null;
 if(typeof x==='boolean'||typeof x==='number'&&Number.isSafeInteger(x))return x;
 if(typeof x!=='string'||x.length>MAX_CELL||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x))
  throw Error('Public file contains unsupported or excessive cell values');
 if(key==='email'||key.endsWith('_email')||x.includes('@')){
  if(!SAFE_EMAIL.test(x))throw Error('Public-import emails must use example.com');
 }
 if(key.includes('phone')&&!/555-01\d\d/.test(x))
  throw Error('Public-import phone numbers must be fictional 555-01xx');
 return x;
}
export function normalizePublicRows(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_ROWS)
  throw Error('Public rows exceed bounded import limit');
 const keys=Object.keys(rows[0]||{});
 if(keys.length<1||keys.length>MAX_COLUMNS||
    keys.includes('id')||keys.some(k=>!COLUMN.test(k)||DENIED_COLUMN.test(k))||
    new Set(keys).size!==keys.length)
  throw Error('Import columns must be safe and exclude reserved or sensitive fields');
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||
     JSON.stringify(Object.keys(row))!==JSON.stringify(keys))
   throw Error('Imported rows must share exact column identities');
 }
 const safe=rows.map(row=>Object.fromEntries(keys.map(k=>[k,safeCell(k,row[k])])));
 const specs=keys.map(name=>{
  const values=safe.map(row=>row[name]).filter(v=>v!==null);
  const numeric=values.every(x=>Number.isSafeInteger(x)||
    typeof x==='string'&&/^-?(0|[1-9]\d*)$/.test(x)&&
      Number.isSafeInteger(Number(x)));
  const bool=values.every(x=>typeof x==='boolean'||x==='true'||x==='false');
  const day=values.every(isIsoDay);
  const type=values.length>0&&numeric?'integer':values.length>0&&bool?'boolean':
   values.length>0&&day?'date':'text';
  return {name,type,nullable:values.length!==safe.length};
 });
 const data=safe.map((row,i)=>{
  const result={id:i+1};
  for(const spec of specs){
   const raw=row[spec.name];
   result[spec.name]=raw===null?null:spec.type==='integer'?Number(raw):
    spec.type==='boolean'?raw===true||raw==='true':String(raw);
  }
  return result;
 });
 return {columns:[{name:'id',type:'integer',nullable:false},...specs],rows:data,
  totalRows:data.length};
}
