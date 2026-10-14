import {describe,it,expect} from 'vitest';
import {createFakeDb} from '../../test/helpers/fake-db.js';
import {createSetupHandler} from '../../api/neon/setup.js';
import {SCRATCH_PHRASE} from '../../src/neon/scratch-ownership.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project} from '../../test/helpers/neon-fixtures.js';

const origin='https://owner.example.test';
const env={PUBLIC_BASE_URL:origin,ADMIN_PASSPHRASE:'FAKE_STRONG_PASS',
 VERCEL_ENV:'production',
 DATABASE_URL:'postgresql://user:FAKE@localhost/owner',
 NEON_MCP_SELF_ORG_ID:IDS.org,NEON_MCP_SELF_PROJECT_ID:'proj-fake-self',
 NEON_MCP_SELF_ENDPOINT_HOST:'localhost'};
function req(method,p={},headers={origin}){
 return {method,headers,body:method==='POST'?p:undefined,
 query:method==='GET'?p:undefined,socket:{remoteAddress:'192.0.2.61'}};
}
function res(){return {headers:{},statusCode:200,body:null,setHeader(k,v){
 this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},
 send(v){this.body=v;return this;},json(v){this.body=JSON.stringify(v);return this;},
 end(){return this;}};}
async function invoke(h,r){const out=res();await h(r,out);return out;}
function fixture(){
 const db=createFakeDb({orgs:[{id:IDS.org,label:'Fake',production_enabled:false}]});
 const rows=[];
 db.getProtectedResources=async()=>[];
 db.saveScratchAttestation=async x=>{rows.push(x);return true;};
 db.revokeScratchAttestation=async x=>{rows.push({revoked:true,...x});return true;};
 db.listScratchAttestations=async()=>rows.filter(r=>!r.revoked);
 const vault={keyFor:async()=>({key:'napi_FAKE_SCRATCH',kind:'project'})};
 const fake=makeFakeNeon();
 fake.when('getProject').resolves({project:project()});
 const client=makeNeonClient({key:'napi_FAKE_SCRATCH',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true};}}});
 const handler=createSetupHandler({db,vault,exchange:{},env,
  scratchClientFor:async()=>client});
 return {handler,rows,fake};
}
const body={action:'attest_scratch_project',orgId:IDS.org,
 projectId:IDS.project,scratchPhrase:SCRATCH_PHRASE,passphrase:env.ADMIN_PASSPHRASE};
describe('passphrase-only isolated scratch owner setup',()=>{
 it('renders an explicit ownership certificate instead of a silent override',async()=>{
  const f=fixture();
  const page=await invoke(f.handler,req('GET'));
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain(SCRATCH_PHRASE);
  expect(page.body).toContain('attest_scratch_project');
  expect(page.body).toContain('revoke_scratch_attestation');
  expect(page.headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
 });
 it('denies wrong origin, passphrase, or typed consent without Neon calls',async()=>{
  const f=fixture();
  expect((await invoke(f.handler,req('POST',body,{origin:'https://wrong.test'}))).statusCode).toBe(403);
  expect((await invoke(f.handler,req('POST',{...body,passphrase:'WRONG'}))).statusCode).toBe(401);
  expect((await invoke(f.handler,req('POST',{...body,scratchPhrase:'yes'}))).statusCode).toBe(400);
  expect(f.rows).toHaveLength(0);
  expect(f.fake.calls).toHaveLength(0);
 });
 it('accepts only exact provider-certified project, then revokes precise attestation',async()=>{
  const f=fixture();
  const approved=await invoke(f.handler,req('POST',body));
  expect(approved.statusCode).toBe(200);
  expect(f.rows).toEqual([{orgId:IDS.org,projectId:IDS.project,projectName:'fake-project'}]);
  const revoked=await invoke(f.handler,req('POST',{action:'revoke_scratch_attestation',
   orgId:IDS.org,projectId:IDS.project,passphrase:env.ADMIN_PASSPHRASE}));
  expect(revoked.statusCode).toBe(200);
  expect(f.rows[1]).toMatchObject({revoked:true,orgId:IDS.org,projectId:IDS.project});
  expect(f.fake.calls.map(x=>x.method)).toEqual(['GET']);
  f.fake.assertClean();
 });
});
