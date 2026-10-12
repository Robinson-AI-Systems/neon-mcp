// RTC 1: distinct hashed owner-issued passes. Never reuse the MCP OAuth token door.
// This early scoped implementation issues ONLY read_only preview project passes.
import {randomToken,hashToken} from './oauth.js';
import {publicOrigin,send} from './http.js';
import {rtcError} from './rtc-contract.js';
import {encryptSecret} from './crypto.js';
export const RTC_PASS_PATTERN=/^rtc_pass_[A-Za-z0-9_-]{43}$/;
const project=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const passId=x=>typeof x==='string'&&/^rtc_[A-Za-z0-9_-]{16}$/.test(x);
const safeTools=new Set(['neon_whoami','neon_where_is_setting','neon_get_settings']);
export const rtcNonproductionTool=name=>safeTools.has(name);

export async function issueReadOnlyRtcPass({db,exchange,env=process.env,
  orgId,projectScope,ttlHours=24,now=()=>Date.now()}={}){
  if(!project(orgId)||!project(projectScope)||
      !Number.isInteger(ttlHours)||ttlHours<1||ttlHours>24||
      typeof db?.createRtcReadOnlyPass!=='function'||
      typeof db?.revokeRtcPass!=='function'||
      typeof exchange?.putOneTimeSecret!=='function')
    throw new TypeError('Owner read_only RTC pass configuration invalid');
  // Preflight the ONE-TIME encrypted channel and trusted public HTTPS origin.
  publicOrigin(env);
  encryptSecret('FAKE_RTC_PREFLIGHT',{env,context:'rtc-preflight'});
  const token='rtc_pass_'+randomToken(32);
  const id='rtc_'+randomToken(12);
  const expiresAt=new Date(now()+ttlHours*60*60*1000);
  if(!RTC_PASS_PATTERN.test(token)||!passId(id))
    throw new Error('RTC entropy generation failed');
  await db.createRtcReadOnlyPass({token,passId:id,orgId,projectScope,expiresAt});
  try {
    const delivered=await exchange.putOneTimeSecret({
      org:orgId,kind:'rtc_read_only_pass',label:'Temporary Neon RTC read_only access',
      secret:token});
    return {passId:id,oneTimeLink:delivered.link,expiresAt:expiresAt.toISOString(),
      profile:'read_only',mode:'preview',allowWrites:false};
  } catch {
    // A delivery failure is not evidence of a usable credential: revoke it.
    await db.revokeRtcPass({orgId,passId:id});
    throw new Error('RTC secret delivery failed; issued grant revoked');
  }
}
const refuse=(res,code,status,headers={})=>{
  for(const [k,v] of Object.entries(headers))res.setHeader(k,v);
  const error=rtcError(code,{status});return send(res,status,error.body);
};
export async function requireRtcPass(req,res,db,{now=()=>Date.now()}={}){
  const bearer=String(req.headers?.authorization||'');
  const match=/^Bearer (rtc_pass_[A-Za-z0-9_-]{43})$/.exec(bearer);
  if(!match)return refuse(res,'permission',401,{'WWW-Authenticate':'Bearer realm="RTC 1"'});
  const token=match[1];
  let row;
  try {row=await db.getRtcPass(token);}
  catch {return refuse(res,'service_error',503);}
  if(!row)return refuse(res,'permission',401);
  if(row.revoked_at)return refuse(res,'pass_revoked',401);
  if(!row.expires_at || new Date(row.expires_at).getTime()<=now())
    return refuse(res,'pass_expired',401);
  if(!passId(row.client_id)||!project(row.neon_org)||!project(row.project_scope)||
      row.kind!=='pass'||row.mode!=='preview'||row.profile!=='read_only'||
      row.listing!=='catalog'||row.allow_writes!==false||
      !Array.isArray(row.rtc_areas)||
      !row.rtc_areas.includes('server')||!row.rtc_areas.includes('discovery')||
      row.rtc_areas.some(x=>!['server','discovery'].includes(x)))
    return refuse(res,'refused_by_guard',403);
  // The budget MUST be shared by every serverless instance (same Postgres row).
  const timestamp=now();
  const windowStart=new Date(Math.floor(timestamp/60000)*60000);
  let admitted;
  try{admitted=await db.consumeApiBudget({
    keyHash:hashToken('rtc:'+token),windowStart,limit:60});}
  catch{return refuse(res,'service_error',503);}
  if(admitted?.allowed!==true)return refuse(res,'rate_limited',429,{'Retry-After':'60'});
  return Object.freeze({clientId:row.client_id,neonOrg:row.neon_org,
    projectScope:row.project_scope,mode:'preview',profile:'read_only',
    listing:'catalog',rtcAreas:Object.freeze([...row.rtc_areas]),
    rtcSafeTools:true});
}
