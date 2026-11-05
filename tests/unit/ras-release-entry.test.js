import {describe,it,expect} from 'vitest';
import {createHash,generateKeyPairSync,constants,privateDecrypt} from 'node:crypto';
import {serverRelease} from '../../src/core/server-release.js';
import {serviceHealth} from '../../src/service-health.js';
import {createHealthHandler} from '../../api/health.js';
import {createFrontDoor} from '../../api/index.js';
import {createConnectionPage} from '../../api/connection.js';
import {handlers as serverTools} from '../../src/tools/server.js';
import {createHandoff,callbackPath} from '../../src/developer/handoff.js';
import {rtcManifest} from '../../src/core/rtc-contract.js';
import {createContractHandler} from '../../api/contract.js';
import {createRtcHttpHandlers} from '../../src/core/rtc-http.js';
import {mcpServerInfo} from '../../src/core/mcp-server.js';
import {registry} from '../../src/tools/index.js';

const origin='https://neon.example.test';
const SHA='a'.repeat(40);
const env={PUBLIC_BASE_URL:origin,VERCEL_GIT_COMMIT_SHA:SHA};
function response(){
 return {statusCode:200,headers:{},headersSent:false,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(s){this.statusCode=s;return this;},
  send(v){this.body=v;this.headersSent=true;return this;},
  json(v){this.body=v;this.headersSent=true;return this;}};
}
const parse=r=>typeof r.body==='string' && r.headers['Content-Type']?.startsWith('application/json')?
 JSON.parse(r.body):r.body;
describe('RAS deployed release identity',()=>{
 it('does not invent a deployment SHA from main, Host, aliases or malformed env',()=>{
   for(const supplied of [undefined,'main','abcdef',SHA.toUpperCase(),'a'.repeat(39)]){
     const r=serverRelease({VERCEL_GIT_COMMIT_SHA:supplied,
       GITHUB_SHA:'f'.repeat(40),HOST:'evil.example'});
     expect(r).toMatchObject({version:'0.1.0',commit:null,source:null});
     expect(r.what_changed).toMatch(/live/);
   }
 });
 it('uses exactly the serving SHA for release identity, whoami and RTC 1 compatibility manifest',async()=>{
   const rel=serverRelease(env);
   expect(rel).toMatchObject({version:'0.1.0+'+SHA.slice(0,12),commit:SHA});
   const db={listNeonOrgs:async()=>[{id:'org-fake',label:'Fake',production_enabled:false}],
     listNeonKeySummaries:async()=>[]};
   const user=JSON.parse((await serverTools.neon_whoami({},{db,env,connection:{
     neonOrg:'org-fake',mode:'preview',profile:'read_only',listing:'compact'
   }})).content[0].text);
   expect(user.server_release).toEqual(rel);
   expect(rtcManifest(registry,{release:rel}).version).toBe(rel.version);
   expect(mcpServerInfo(env)).toMatchObject({version:rel.version,name:'robinson-neon-mcp'});
   expect(rel.source).toContain(SHA);
 });
 it('binds live public RTC manifest and authenticated HTTP whoami to the exact serving release only',async()=>{
   const source={...env,RTC1_ENABLED:'1',VERCEL_ENV:'production'};
   const rel=serverRelease(source),pass='rtc_pass_'+'B'.repeat(43);
   const db={
     async getRtcPass(){return {client_id:'rtc_'+'A'.repeat(16),
       neon_org:'org-fake',project_scope:'proj-fake',mode:'preview',
       profile:'read_only',listing:'catalog',kind:'pass',
       rtc_areas:['server','discovery'],allow_writes:false,
       rtc_requests_per_minute:60,
       expires_at:new Date(Date.now()+3600000),revoked_at:null};},
     async consumeApiBudget(){return {allowed:true};}
   };
   const publicRes=response();
   createContractHandler({env:source,registry})({method:'GET'},publicRes);
   expect(publicRes.statusCode).toBe(200);
   expect(publicRes.body.server_release).toEqual(rel);
   expect(publicRes.body.version).toBe(rel.version);
   const whoami=createRtcHttpHandlers({db,registry,env:source}).whoami;
   const privateRes=response();
   await whoami({method:'GET',headers:{authorization:'Bearer '+pass}},privateRes);
   expect(privateRes.statusCode).toBe(200);
   expect(parse(privateRes).result.server_release).toEqual(rel);
   expect(mcpServerInfo(source).version).toBe(rel.version);
   expect(()=>rtcManifest(registry,{release:rel,version:'wrong'})).toThrow(/release/i);
   const unknown={...source,VERCEL_GIT_COMMIT_SHA:'not-a-deployed-commit'};
   const noSha=response();
   createContractHandler({env:unknown,registry})({method:'GET',
     headers:{host:'malicious.example'}},noSha);
   expect(noSha.body.server_release).toEqual(serverRelease(unknown));
   expect(noSha.body.server_release.commit).toBeNull();
   expect(JSON.stringify(noSha.body)).not.toContain('malicious.example');
 });
 it('probes only when explicitly requested, never exposes storage settings or private origins',async()=>{
   const noProbe=await serviceHealth({env,now:()=>new Date('2026-11-02T12:00:00Z')});
   expect(noProbe).toMatchObject({status:'degraded',revision:SHA,
     timestamp:'2026-11-02T12:00:00.000Z',tools:registry.tools.length});
   const healthy=await serviceHealth({env,probe:async()=>true});
   expect(healthy.status).toBe('ok');
   const fail=await serviceHealth({env,probe:async()=>{throw Error('secret database');}});
   expect(fail.status).toBe('degraded');
   expect(JSON.stringify(fail)).not.toContain('secret database');
 });
 it('serves status 200/503, denies unsafe methods, and sends no secret-bearing health data',async()=>{
   const healthy=async()=>({status:'ok',version:'0.1.0',revision:SHA,tools:4,
     timestamp:'2026-11-02T12:00:00.000Z'});
   const ok=response();
   await createHealthHandler({env,health:healthy})({method:'GET'},ok);
   expect(ok.statusCode).toBe(200);expect(parse(ok).revision).toBe(SHA);
   const down=response();
   await createHealthHandler({env,health:async()=>({...await healthy(),status:'degraded'})})({method:'GET'},down);
   expect(down.statusCode).toBe(503);
   const invalid=response();
   await createHealthHandler({env,health:healthy})({method:'POST'},invalid);
   expect(invalid.statusCode).toBe(405);
 });
 it('provides a public customer connection page pinned to configuration, never request Host or developer login',()=>{
   const page=response();
   createConnectionPage({env})({method:'GET',headers:{host:'attacker.example'}},page);
   expect(page.statusCode).toBe(200);
   expect(page.body).toContain(origin+'/api/mcp');
   expect(page.body).toContain(origin+'/api/connect/handoff');
   expect(page.body).toContain(origin+'/api/oauth/revoke');
   expect(page.body).not.toContain('attacker.example');
   expect(page.body).not.toMatch(/developer sign.?in/i);
   const unconfigured=response();
   createConnectionPage({env:{}})({method:'GET'},unconfigured);
   expect(unconfigured.statusCode).toBe(503);
 });
 it('returns accessible branded HTML and accurate unknown/degraded state, without developer login or secrets',async()=>{
   const req={method:'GET',headers:{host:'malicious.example'}};
   const html=response();
   await createFrontDoor({env:{PUBLIC_BASE_URL:origin},health:async()=>({status:'degraded',tools:12})})(req,html);
   expect(html.statusCode).toBe(200);
   expect(html.headers['Content-Type']).toMatch(/text\/html/);
   expect(html.body).toContain('Neon Unleashed by Robinson AI Systems');
   expect(html.body).toContain('degraded');
   expect(html.body).toContain('Unavailable (not verified)');
   expect(html.body).not.toContain('malicious.example');
   expect(html.body).not.toMatch(/Developer connection|developer sign.?in/i);
   const current=response();
   await createFrontDoor({env,health:async()=>({status:'ok',tools:10})})(req,current);
   expect(current.body).toContain(SHA.slice(0,12));
   expect(current.body).toContain('github.com/Robinson-AI-Systems/neon-mcp/commit/'+SHA);
   const invalid=response();
   await createFrontDoor({env})({method:'POST'},invalid);
   expect(invalid.statusCode).toBe(405);
 });
});
describe('customer mobile OAuth handoff and developer namespace compatibility',()=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});
 const path='/api/connect/handoff',challenge='a'.repeat(43),code='b'.repeat(43),
   secret='c'.repeat(43);
 const input={client_id:'customer_client_123',challenge,
  poll_hash:createHash('sha256').update(secret).digest('hex'),
  public_key:keys.publicKey.export({type:'spki',format:'pem'}),profile:'read_only'};
 function make(route){
  let row;
  const store={
   async start(p){row={...p,expires_at:p.expires,status:'pending'};return true;},
   async find(state){return row?.state===state?row:null;},
   async codeProof(c){return c===code?{client_id:row.client_id,
     redirect_uri:origin+route,code_challenge:challenge,code_challenge_method:'S256'}:null;},
   async approve(state,sealed){if(row.state!==state || row.status!=='pending')return false;
     row.status='authorized';row.sealed_code=sealed;return true;},
   async poll(state,hash){return row?.state===state&&row?.poll_hash===hash?row:null;},
   async deny(){row.status='denied';}
  };
  return {run:createHandoff({store,origin,callbackPath:route,
   getClient:async()=>({redirect_uris:[origin+route]})}),row:()=>row};
 }
 for(const route of [path,callbackPath])it('keeps one-time PKCE consent and bound callback for '+route,async()=>{
   const f=make(route);const start=response();
   await f.run({method:'POST',headers:{},body:input},start);
   expect(start.statusCode).toBe(201);
   const authorization=new URL(start.body.authorization_url);
   expect(authorization.searchParams.get('redirect_uri')).toBe(origin+route);
   expect(authorization.searchParams.get('resource')).toBe(origin+'/api/mcp');
   const callback=response();
   await f.run({method:'GET',query:{state:f.row().state,code},headers:{}},callback);
   expect(callback.statusCode).toBe(200);
   expect(callback.body).toContain('Neon connection');
   expect(callback.body).not.toContain('Developer connection');
   const poll=response();
   await f.run({method:'GET',query:{state:f.row().state},
    headers:{authorization:'Bearer '+secret}},poll);
   expect(poll.statusCode).toBe(200);
   const unsealed=privateDecrypt({key:keys.privateKey,oaepHash:'sha256',
     padding:constants.RSA_PKCS1_OAEP_PADDING},
     Buffer.from(poll.body.sealed_code,'base64url')).toString();
   expect(unsealed).toBe(code);
 });
 it('rejects arbitrary callbacks, unregistered clients and invalid cross-client proof',async()=>{
   expect(()=>make('/api/developer/grant')).toThrow('invalid_callback');
   const wrong=createHandoff({store:{},origin,callbackPath:path,
     getClient:async()=>({redirect_uris:[origin+callbackPath]})});
   const denied=response();
   await wrong({method:'POST',body:input,headers:{}},denied);
   expect(denied.statusCode).toBe(400);expect(denied.body.error).toBe('invalid_client');
 });
});
