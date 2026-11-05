// R-2 synthetic client HTTP paths against a *real disposable PostgreSQL*
// schema: no Neon provider account or production permission is involved.
import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {createDb} from '../../src/db.js';
import {registry} from '../../src/tools/index.js';
import {hashToken} from '../../src/core/oauth.js';
import {resultScope} from '../../src/core/result-store.js';
import {createRtcHttpHandlers} from '../../src/core/rtc-http.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery}
  from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';

const secret=()=> 'rtc_pass_'+randomBytes(32).toString('base64url');
const principal=()=> 'rtc_'+randomBytes(12).toString('base64url');
const expiry=()=>new Date(Date.now()+600_000);
const resource=[
  {org:'org-fake-rtc2-one',project:'proj-fake-rtc2-one'},
  {org:'org-fake-rtc2-two',project:'proj-fake-rtc2-two'}
];
let db,instances,passes;
function resultResponse(){
  return {headers:{},statusCode:200,body:null,headersSent:false,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.statusCode=n;return this;},
    json(body){this.body=body;this.headersSent=true;return this;},
    send(body){this.body=typeof body==='string'?JSON.parse(body):body;
      this.headersSent=true;return this;}};
}
async function call(instance,door,token,query={}){
  const res=resultResponse();
  await instance[door]({method:'GET',headers:{authorization:'Bearer '+token},
    query},res);
  return res;
}
beforeAll(async()=>{
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();
  for(const item of resource){
    await db.saveNeonOrg({orgId:item.org,label:'Fake RTC 2 tenant'});
    await db.saveEncryptedNeonKey({orgId:item.org,kind:'project',
      projectId:item.project,keyEnc:'fake-not-a-provider-key',
      last4:'FAKE',reach:{verified:true}});
  }
  passes=[
    {token:secret(),id:principal(),...resource[0],cap:20},
    {token:secret(),id:principal(),...resource[0],cap:20},
    {token:secret(),id:principal(),...resource[1],cap:3}
  ];
  for(const p of passes)
    await db.createRtcReadOnlyPass({token:p.token,passId:p.id,
      orgId:p.org,projectScope:p.project,expiresAt:expiry(),
      requestsPerMinute:p.cap});
  instances=[0,1].map(()=>createRtcHttpHandlers({
    db:createDb(neonShapedQuery()),registry,
    env:{RTC1_ENABLED:'1',VERCEL_ENV:'production'},wireVersion:2
  }));
});
afterAll(async()=>{await closeIsolatedSchema();});

it('binds RTC 2 catalog and cursor to the exact hashed pass across two server instances',async()=>{
  const one=await call(instances[0],'tools',passes[0].token,
    {limit:'1',listing:'catalog'});
  expect(one.statusCode).toBe(200);
  expect(one.body.result.count).toBe(3);
  expect(one.body.result.tools).toHaveLength(1);
  const cursor=one.body.result.next;
  expect(cursor).toEqual(expect.any(String));
  const same=await call(instances[1],'tools',passes[0].token,
    {limit:'1',listing:'catalog',cursor});
  expect(same.statusCode).toBe(200);
  expect(same.body.result.tools).toHaveLength(1);
  for(const foreign of [passes[1],passes[2]]){
    const denied=await call(instances[1],'tools',foreign.token,
      {limit:'1',listing:'catalog',cursor});
    expect(denied.statusCode).toBe(400);
    expect(denied.body.error.code).toBe('invalid_args');
  }
  const who=await call(instances[0],'whoami',passes[2].token);
  expect(who.statusCode).toBe(200);
  expect(who.body.result).toMatchObject({projectScope:resource[1].project,
    profile:'read_only',mode:'preview',allowWrites:false,requestsPerMinute:3});
  expect(JSON.stringify(who.body)).not.toContain(passes[2].token);
});

it('recovers exact canonical Unicode bytes only for the exact originating pass, not another tenant or another pass',async()=>{
  const p=passes[0],handle='res_'+randomBytes(20).toString('hex');
  const original=JSON.stringify({records:Array.from({length:800},(_,i)=>({
    id:i,tag:'👍 unit test',label:'safe public value'}))});
  const connection=resultScope({clientId:p.id,neonOrg:p.org,
    projectScope:p.project,mode:'preview',profile:'read_only',
    rtcResultGrant:hashToken('rtc2-cursor:'+p.token)});
  // Deliberately attempt to lie about the canonical content with a
  // sensitive field: storage must refuse it instead of preserving secrets.
  const forged='res_'+randomBytes(20).toString('hex');
  await expect(db.saveResultHandle({handle:forged,connection,
    summary:'wrong raw content',
    body:{secret:'fake-sensitive-value'},
    canonicalText:JSON.stringify({secret:'fake-sensitive-value'}),
    expiresAt:expiry()})).rejects.toThrow(/Canonical result does not match/);
  await db.saveResultHandle({handle,connection,summary:'fake multi-page result',
    body:JSON.parse(original),canonicalText:original,expiresAt:expiry()});
  const chunks=[];
  for(let page=1;page<=200;page++){
    const res=await call(instances[page%2],'results',p.token,
      {handle,page:String(page)});
    expect(res.statusCode).toBe(200);
    expect(Buffer.byteLength(JSON.stringify(res.body))).toBeLessThanOrEqual(8192);
    expect(res.body.result.page).toBe(page);
    expect(res.body.result.bytes).toBe(Buffer.byteLength(original,'utf8'));
    chunks.push(res.body.result.content);
    if(res.body.result.next===null)break;
    expect(res.body.result.next).toBe(page+1);
  }
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.join('')).toBe(original);
  for(const foreign of [passes[1],passes[2]]){
    const denied=await call(instances[1],'results',foreign.token,
      {handle,page:'1'});
    expect(denied.statusCode).toBe(404);
    expect(denied.body.error.code).toBe('not_found');
  }
  const bad=await call(instances[0],'results',p.token,{handle,page:'0'});
  expect(bad.statusCode).toBe(400);
});

it('does not resurrect revoked grants or accept OAuth credentials through RTC 2',async()=>{
  const p=passes[0];
  expect(await db.revokeRtcPass({orgId:p.org,passId:p.id})).toBe(true);
  const revoked=await call(instances[1],'whoami',p.token);
  expect(revoked.statusCode).toBe(401);
  expect(revoked.body.error.code).toBe('pass_revoked');
  const invalid=await call(instances[0],'whoami','fake-oauth-access-token');
  expect(invalid.statusCode).toBe(401);
});
