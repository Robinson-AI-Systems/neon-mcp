import {describe,it,expect} from 'vitest';
import {createFakeDb} from '../../test/helpers/fake-db.js';
import {createOneTimeSecrets} from '../../src/core/one-time.js';
import {createSetupHandler} from '../../api/neon/setup.js';
const env={PUBLIC_BASE_URL:'https://neon-mcp.example.test',
  TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,16).toString('base64url'),
  ADMIN_PASSPHRASE:'FAKE_owner_password',VERCEL_ENV:'preview',RTC1_ENABLED:'1'};
function res(){return {headers:{},statusCode:200,body:'',
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  send(x){this.body=x;return this;},json(x){this.body=JSON.stringify(x);return this;}};}
const req=(body,headers={origin:env.PUBLIC_BASE_URL})=>({method:'POST',body,
  headers,socket:{remoteAddress:'192.0.2.9'}});
const invoke=async(handler,request)=>{const r=res();await handler(request,r);return r;};
function fixture(){
  const db=createFakeDb({orgs:[{id:'org-fake-one',label:'Fake',
    production_enabled:false}]});
  const issued=[],revoked=[];
  db.createRtcReadOnlyPass=async x=>{issued.push(x);return {passId:x.passId};};
  db.revokeRtcPass=async x=>{revoked.push(x);return true;};
  const exchange=createOneTimeSecrets({db,env});
  const vault={listKeys:async()=>[],storeKey:async()=>({}),
    revokeKey:async()=>false};
  const handler=createSetupHandler({db,exchange,vault,env});
  return {issued,revoked,exchange,handler};
}
describe('Owner-only RTC pass page and revocation',()=>{
 it('requires exact-origin + owner passphrase and keeps the pass off HTML',async()=>{
  const f=fixture(),body={action:'create_read_only_rtc_pass',
    orgId:'org-fake-one',projectId:'proj-fake-one',ttlHours:'1',
    passphrase:env.ADMIN_PASSPHRASE};
  const noOrigin=await invoke(f.handler,req(body,{}));
  expect(noOrigin.statusCode).toBe(403);
  const wrong=await invoke(f.handler,req({...body,passphrase:'incorrect'}));
  expect(wrong.statusCode).toBe(401);
  expect(f.issued).toHaveLength(0);
  const created=await invoke(f.handler,req(body));
  expect(created.statusCode).toBe(200);
  expect(f.issued).toHaveLength(1);
  expect(created.body).toContain('once=');
  expect(created.body).toContain('Temporary read_only pass');
  expect(created.body).not.toContain(f.issued[0].token);
  expect(created.headers['Cache-Control']).toBe('no-store');
  const shown=await invoke(f.handler,req({action:'view_once',orgId:'org-fake-one',
    onceId:created.body.match(/once=([A-Za-z0-9_-]+)/)?.[1],
    passphrase:env.ADMIN_PASSPHRASE}));
  expect(shown.statusCode).toBe(200);
  expect(shown.body).toContain('rtc_pass_');
 });
 it('supports owner-only revocation and denies invalid expiry/scope',async()=>{
  const f=fixture(),base={action:'create_read_only_rtc_pass',orgId:'org-fake-one',
    projectId:'proj-fake-one',ttlHours:'1',passphrase:env.ADMIN_PASSPHRASE};
  expect((await invoke(f.handler,req({...base,ttlHours:'30'}))).statusCode).toBe(400);
  expect((await invoke(f.handler,req({...base,projectId:'../../other'}))).statusCode).toBe(400);
  const revoked=await invoke(f.handler,req({action:'revoke_read_only_rtc_pass',
    orgId:'org-fake-one',passId:'rtc_'+'A'.repeat(16),passphrase:env.ADMIN_PASSPHRASE}));
  expect(revoked.statusCode).toBe(200);
  expect(f.revoked).toHaveLength(1);
 });
});
