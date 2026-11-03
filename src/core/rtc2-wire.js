// RTC 2 wire primitives. Keep RTC 1 behavior until the whole RTC 2 surface
// passes its adoption gate; neither helper changes the advertised protocol.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const RTC2_REPLY_BYTES=8192;
const CURSOR_MAX_BYTES=768;
const CONTENT_CHUNK_BYTES=3000; // deterministic, UTF-8-safe and below even escaped JSON reply budget
const validString=s=>typeof s==='string'&&s.length>0;
const fingerprint=filters=>createHash('sha256').update(JSON.stringify(filters)).digest('hex');
const signature=(secret,payload)=>createHmac('sha256',secret).update(payload).digest('hex');

function parseCursor(cursor,secret,filters){
  if(cursor===undefined)return 0;
  if(!validString(cursor)||Buffer.byteLength(cursor)>CURSOR_MAX_BYTES||
     !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(cursor))
    throw new TypeError('Invalid RTC 2 cursor');
  const [encoded,mac]=cursor.split('.');
  const expected=signature(secret,encoded);
  if(!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(expected,'hex')))
    throw new TypeError('RTC 2 cursor does not belong to this pass');
  let decoded;
  try{decoded=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}
  catch{throw new TypeError('Invalid RTC 2 cursor');}
  if(decoded?.v!==2||decoded?.scope!==fingerprint(filters)||
     !Number.isSafeInteger(decoded?.offset)||decoded.offset<1)
    throw new TypeError('RTC 2 cursor filter or offset mismatch');
  return decoded.offset;
}
function makeCursor(offset,secret,filters){
  const payload=Buffer.from(JSON.stringify({v:2,offset,scope:fingerprint(filters)}))
    .toString('base64url');
  return payload+'.'+signature(secret,payload);
}
export function rtc2CatalogPage({items,passBinding,filters,limit=20,cursor}={}){
  if(!Array.isArray(items)||!validString(passBinding)||!filters||
      typeof filters!=='object'||Array.isArray(filters)||
      !Number.isSafeInteger(limit)||limit<1||limit>100)
    throw new TypeError('Invalid RTC 2 discovery request');
  const offset=parseCursor(cursor,passBinding,filters);
  if(offset>=items.length&&cursor!==undefined)
    throw new TypeError('RTC 2 cursor beyond final page');
  const page=[];
  const count=items.length;
  for(let i=offset;i<Math.min(count,offset+limit);i++){
    const tool=items[i];
    if(!validString(tool?.name)||!validString(tool?.description))
      throw new TypeError('Invalid RTC 2 catalog item');
    // Search is deliberately schema-free. Full input schema belongs to describe.
    const summary={name:tool.name,description:tool.description,
      area:tool.area,writes:tool.writes===true,money:tool.money===true,
      audience:tool.audience};
    const proposed=[...page,summary];
    const next=i+1<count?makeCursor(i+1,passBinding,filters):null;
    const body={ok:true,result:{tools:proposed,count,next}};
    if(Buffer.byteLength(JSON.stringify(body))>RTC2_REPLY_BYTES){
      if(!page.length)throw new TypeError('RTC 2 tool too large; describe the named tool instead');
      break;
    }
    page.push(summary);
  }
  const next=offset+page.length<count?
    makeCursor(offset+page.length,passBinding,filters):null;
  const result={ok:true,result:{tools:page,count,next}};
  if(Buffer.byteLength(JSON.stringify(result))>RTC2_REPLY_BYTES)
    throw new TypeError('RTC 2 reply budget exceeded');
  return result;
}
export function rtc2ContentPage({handle,text,page=1}={}){
  if(!/^res_[a-f0-9]{40}$/.test(handle||'')||
      typeof text!=='string'||!Number.isSafeInteger(page)||page<1)
    throw new TypeError('Invalid RTC 2 result-page request');
  const bytes=Buffer.from(text,'utf8');
  const chunks=[];
  for(let at=0;at<bytes.length;){
    let end=Math.min(bytes.length,at+CONTENT_CHUNK_BYTES);
    // Never split inside a multibyte UTF-8 code point.
    while(end<bytes.length && (bytes[end]&0xc0)===0x80)end--;
    if(end<=at)throw new TypeError('RTC 2 UTF-8 page boundary');
    chunks.push(bytes.subarray(at,end).toString('utf8'));
    at=end;
  }
  if(!chunks.length)chunks.push('');
  if(page>chunks.length)throw new TypeError('RTC 2 page past end');
  const result={ok:true,result:{handle,page,pages:chunks.length,bytes:bytes.length,
    content:chunks[page-1],next:page<chunks.length?page+1:null}};
  if(Buffer.byteLength(JSON.stringify(result))>RTC2_REPLY_BYTES)
    throw new TypeError('RTC 2 content-page budget exceeded');
  return result;
}
