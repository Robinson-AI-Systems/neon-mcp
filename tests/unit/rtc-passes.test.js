import {describe,it,expect} from 'vitest';
import {issueReadOnlyRtcPass,requireRtcPass,rtcNonproductionTool,
  RTC_PASS_PATTERN} from '../../src/core/rtc-passes.js';

const env={PUBLIC_BASE_URL:'https://neon.example.test',
  TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,47).toString('base64url')};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;return this;},
  status(s){this.code=s;return this;},send(data){this.body=JSON.parse(data);return this;}});
const row={client_id:'rtc_'+ 'A'.repeat(16),neon_org:'org-fake-one',
  project_scope:'proj-fake-one',mode:'preview',profile:'read_only',
  listing:'catalog',kind:'pass',rtc_areas:['server','discovery'],
  allow_writes:false,expires_at:new Date(Date.now()+3600000),revoked_at:null};
const request=(token)=>({headers:{authorization:'Bearer '+token}});
const token='rtc_pass_'+ 'B'.repeat(43);
describe('RTC scoped pass boundary',()=>{
 it('generates encrypted one-time owner delivery, no bearer in receipt',async()=>{
  const saved=[],revoke=[];
  const db={createRtcReadOnlyPass:async x=>{saved.push(x);return {passId:x.passId};},
    revokeRtcPass:async x=>{revoke.push(x);return true;}};
  const exchange={putOneTimeSecret:async x=>{
    expect(RTC_PASS_PATTERN.test(x.secret)).toBe(true);
    expect(x.kind).toBe('rtc_read_only_pass');
    return {link:'https://neon.example.test/api/neon/setup?once=fake-link'};}};
  const result=await issueReadOnlyRtcPass({db,exchange,env,
    orgId:'org-fake-one',projectScope:'proj-fake-one',ttlHours:2});
  expect(result).toMatchObject({profile:'read_only',mode:'preview',
    allowWrites:false,passId:expect.any(String)});
  expect(JSON.stringify(result)).not.toContain(saved[0].token);
  expect(saved).toHaveLength(1);expect(revoke).toHaveLength(0);
 });
 it('revokes a pass if the one-time channel fails after persistence',async()=>{
  const revoke=[];
  const db={createRtcReadOnlyPass:async()=>({}),
    revokeRtcPass:async data=>{revoke.push(data);return true;}};
  await expect(issueReadOnlyRtcPass({db,env,orgId:'org-fake-one',
    projectScope:'proj-fake-one',
    exchange:{putOneTimeSecret:async()=>{throw Error('fake-store-failure');}}}))
    .rejects.toThrow(/revoked/);
  expect(revoke).toHaveLength(1);
 });
 it('rejects unscoped/non-owner/longer than 24-hour issuance',async()=>{
  for(const args of [{orgId:''},{projectScope:''},{ttlHours:25},
    {ttlHours:0},{projectScope:'other/branch'}]){
    await expect(issueReadOnlyRtcPass({db:{},exchange:{},env,
      orgId:'org-fake-one',projectScope:'proj-fake-one',...args}))
      .rejects.toThrow();
  }
 });
 it('accepts only an exact RTC pass and uses one database-atomic shared budget',async()=>{
  const used=[],db={getRtcPass:async()=>row,
    consumeApiBudget:async x=>{used.push(x);return {allowed:true};}};
  const res=response();
  const connection=await requireRtcPass(request(token),res,db);
  expect(connection).toMatchObject({profile:'read_only',mode:'preview',
    clientId:row.client_id,projectScope:row.project_scope,rtcSafeTools:true});
  expect(used[0].limit).toBe(60);
  expect(used[0].keyHash).toMatch(/^[a-f0-9]{64}$/);
  expect(used[0].keyHash).not.toContain(token);
  expect(rtcNonproductionTool('neon_whoami')).toBe(true);
  for(const denied of ['neon_call','neon_batch','neon_database_list',
    'neon_role_delete','neon_compute_list'])
    expect(rtcNonproductionTool(denied)).toBe(false);
 });
 it('rejects MCP bearer tokens, missing, expired, revoked and forged write permissions',async()=>{
  const base={getRtcPass:async()=>row,consumeApiBudget:async()=>({allowed:true})};
  const cases=[
    [request('oauth_token_not_a_pass'),base,401,'permission'],
    [request(token),{...base,getRtcPass:async()=>null},401,'permission'],
    [request(token),{...base,getRtcPass:async()=>({...row,revoked_at:new Date()})},401,'pass_revoked'],
    [request(token),{...base,getRtcPass:async()=>({...row,expires_at:new Date(0)})},401,'pass_expired'],
    [request(token),{...base,getRtcPass:async()=>({...row,allow_writes:true})},403,'refused_by_guard'],
    [request(token),{...base,getRtcPass:async()=>({...row,mode:'production'})},403,'refused_by_guard'],
    [request(token),{...base,getRtcPass:async()=>({...row,rtc_areas:['server','sql']})},403,'refused_by_guard'],
    [request(token),{...base,consumeApiBudget:async()=>({allowed:false})},429,'rate_limited']
  ];
  for(const [req,db,status,code] of cases){
    const res=response();
    expect(await requireRtcPass(req,res,db)).toBeFalsy();
    expect(res.code).toBe(status);
    expect(res.body.error.code).toBe(code);
    if(status===429)expect(res.headers['Retry-After']).toBe('60');
  }
 });
});
