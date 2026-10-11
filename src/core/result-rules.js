// Provider-neutral, additive display helpers. Never change stored UTC/cents/bytes fields.
const denver = new Intl.DateTimeFormat('en-US', {timeZone:'America/Denver',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
  second:'2-digit',hourCycle:'h23',timeZoneName:'short'});
export function localTime(utc) {
  if(typeof utc!=='string' || !/^\d{4}-\d\d-\d\dT/.test(utc))return null;
  const date=new Date(utc);
  return Number.isNaN(date.getTime())?null:denver.format(date);
}
export function shapeResult(value,{production=false}={}){
  const seen=new WeakSet();
  function visit(v,depth){
    if(depth>40)return null;
    if(Array.isArray(v))return v.map(item=>visit(item,depth+1));
    if(!v || typeof v!=='object' || v instanceof Date)return v;
    if(seen.has(v))return null;
    seen.add(v);
    const out={};
    for(const [key,raw] of Object.entries(v)){
      out[key]=visit(raw,depth+1);
      if(typeof raw==='string' && /(?:_at|_time|_timestamp)$/.test(key)){
        const local=localTime(raw);
        if(local)out[key+'_local']=local;
      }
      if(typeof raw==='number' && Number.isFinite(raw) && raw>=0){
        if(/_cents$/.test(key))out[key+'_display']='$'+(raw/100).toFixed(2);
        else if(/_bytes$/.test(key))out[key+'_display']=(raw/1073741824).toFixed(2)+' GB';
      }
    }
    if(production && !Object.hasOwn(out,'production'))out.production=true;
    seen.delete(v);
    return out;
  }
  return visit(value,0);
}

// C-1: projection is always downstream of the secret scrub; never resolve inherited keys.
import {summarizeResources} from './resource-summaries.js';
const forbidden=new Set(['__proto__','prototype','constructor']);
export function projectFields(source,fields){
 if(typeof fields!=='string'||fields.length>512)throw new TypeError('Invalid field list');
 const paths=fields.split(',').map(x=>x.trim()).filter(Boolean);
 if(!paths.length||paths.length>20)throw new TypeError('Select 1 to 20 fields');
 const output={},unknown=[];
 for(const path of paths){
  const parts=path.split('.');
  if(parts.length>12||parts.some(x=>!x||forbidden.has(x)||!/^[a-zA-Z0-9_-]+$/.test(x)))
   throw new TypeError('Invalid field path');
  let src=source;
  for(const part of parts){
   if(src!==null&&typeof src==='object'&&Object.hasOwn(src,part))src=src[part];
   else{src=undefined;break;}
  }
  if(src===undefined){unknown.push(path);continue;}
  let target=output;
  for(const part of parts.slice(0,-1)){
   if(!Object.hasOwn(target,part))target[part]={};
   if(target[part]===null||typeof target[part]!=='object'||Array.isArray(target[part])){
    unknown.push(path);target=null;break;
   }
   target=target[part];
  }
  if(target)target[parts.at(-1)]=src;
 }
 return unknown.length?{...output,unknownFields:unknown}:output;
}
export function selectResult(value,args={}){
 if(args?.fields!==undefined)return projectFields(value,args.fields);
 if(args?.detail!==undefined&&!['summary','full'].includes(args.detail))
  throw new TypeError('Detail must be summary or full');
 return args.detail==='full'?value:summarizeResources(value);
}
