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
