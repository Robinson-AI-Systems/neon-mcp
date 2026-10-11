// B-6: recursive output/audit scrub. Never persist or disclose secret-bearing provider fields.
const secretKeys = new Set(['password','password_hash','passphrase','connection_uri','connection_uris',
  'connection_string','connection_strings','api_token','api_key','api_secret','secret',
  'secret_key','private_key','client_secret','access_token','refresh_token','authorization',
  's3_secret_access_key','secret_server_key','auth_data','credentials','credential','key_enc',
  'secret_access_key','signed_url','presigned_url','dsn']);
const auditPersonal = new Set(['email','emails','email_address','phone','phone_number','name',
  'first_name','last_name','full_name','address','ip_address']);
const secretValue = /\b(?:napi|npg|gh[pousr])_[A-Za-z0-9_-]{5,}\b/g;
const connection = /\b(postgres(?:ql)?:\/\/[^\s"'<>:@/]+:)[^@\s"'<>/]+(@[^\s"'<>]+)/gi;
const auth = /\b(bearer|basic)\s+[^\s"'<>]+/gi;
const credentialPair = /\b(password|passphrase|api[_-]?key|token|secret)\s*[:=]\s*[^\s,;&"'<>]+/gi;
const signedUrl = /(?:https?:\/\/[^\s"'<>]*[?&](?:X-Amz-(?:Signature|Credential)|X-Goog-Signature|sig|signature|token)=)[^\s"'<>]*/gi;
const normalize = name => String(name).replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase();
export function redactNeonText(value) {
  return String(value).replace(connection,'$1[hidden]$2')
    .replace(secretValue,'[hidden credential]').replace(auth,'$1 [hidden]')
    .replace(signedUrl,'[hidden signed URL]').replace(credentialPair,'$1=[hidden]');
}
export function scrubNeonResult(value,{audit=false}={}) {
  const seen=new WeakSet();
  const visit=(v,depth)=>{
    if (depth>40) return '[hidden oversized nesting]';
    if (typeof v==='string') return redactNeonText(v);
    if (typeof v==='bigint') return v.toString();
    if (v instanceof Date) return Number.isNaN(v.getTime())?null:v.toISOString();
    if (!v || typeof v!=='object') return v;
    if (seen.has(v)) return '[hidden circular reference]';
    seen.add(v);
    if (Array.isArray(v)) { const out=v.map(x=>visit(x,depth+1));seen.delete(v);return out; }
    const out={};
    for(const [k,item] of Object.entries(v)){
      const key=normalize(k);
      if(secretKeys.has(key) || key.endsWith('_password') ||
        key.endsWith('_secret') || key.endsWith('_token') ||
        (key==='key' && (typeof item!=='string' || /^(napi_|npg_|sk_|pk_)/.test(item))) ||
        (key==='uri' && typeof item==='string' && /(?:postgres|password=)/i.test(item)) ||
        (key==='url' && typeof item==='string' &&
          /[?&](?:X-Amz-|X-Goog-|sig=|signature=|token=)/i.test(item)))continue;
      if(audit && (auditPersonal.has(key) || key==='before' || key==='after')){
        // Audit snapshots keep only an identifier, never personal or nested untrusted data.
        if(key==='before'||key==='after'){
          if(item && typeof item==='object' && !Array.isArray(item)){
            out[k]=Object.fromEntries(Object.entries(item).filter(([field,val])=>
              /^(id|[a-z]+_id)$/.test(field) && typeof val==='string' &&
              /^[A-Za-z0-9_-]{1,128}$/.test(val)));
          }
        }
        continue;
      }
      out[k]=visit(item,depth+1);
    }
    seen.delete(v);
    return out;
  };
  return visit(value,0);
}
export const scrubAuditRow=value=>scrubNeonResult(value,{audit:true});
