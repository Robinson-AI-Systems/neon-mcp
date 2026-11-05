import {describe,it,expect} from 'vitest';
import {createFakeDb} from '../../test/helpers/fake-db.js';
import {createSetupHandler} from '../../api/neon/setup.js';
import {IDS} from '../../test/helpers/neon-fixtures.js';

const origin='https://owner.example.test';
const env={PUBLIC_BASE_URL:origin,ADMIN_PASSPHRASE:'FAKE_STRONG_PASS',
  VERCEL_ENV:'production'};
function req(method,p={},headers={origin}){
  return {method,headers,body:method==='POST'?p:undefined,
    query:method==='GET'?p:undefined,socket:{remoteAddress:'192.0.2.62'}};
}
function res(){return {headers:{},statusCode:200,body:null,setHeader(k,v){
  this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},
  send(v){this.body=v;return this;},json(v){this.body=JSON.stringify(v);return this;},
  end(){return this;}};}
async function invoke(h,r){const out=res();await h(r,out);return out;}
function fixture(){
  const db=createFakeDb({orgs:[{id:IDS.org,label:'Fake',production_enabled:false}]});
  const calls=[];
  db.getNeonOrgRemovalPreview=async orgId=>orgId===IDS.org
    ? {org:{id:IDS.org,label:'Fake',production_enabled:false,is_default:true},
      storedKeys:2,liveKeys:1,liveTokens:3,livePasses:1,pendingCodes:1}:null;
  db.deleteNeonOrg=async orgId=>{calls.push(orgId);
    return {keysRevoked:1,tokensRevoked:3,codesRemoved:1};};
  const handler=createSetupHandler({db,vault:{},exchange:{},env});
  return {handler,calls};
}
const body={action:'remove_organization',orgId:IDS.org,
  removalPhrase:'REMOVE ORGANIZATION',passphrase:env.ADMIN_PASSPHRASE};
describe('CAP-7 setup-page organization removal',()=>{
  it('renders the removal form with its typed confirmation',async()=>{
    const f=fixture();
    const page=await invoke(f.handler,req('GET'));
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('remove_organization');
    expect(page.body).toContain('REMOVE ORGANIZATION');
  });
  it('refuses without the typed phrase or the passphrase and deletes nothing',async()=>{
    const f=fixture();
    expect((await invoke(f.handler,req('POST',{...body,removalPhrase:'remove'}))).statusCode).toBe(400);
    expect((await invoke(f.handler,req('POST',{...body,passphrase:'WRONG'}))).statusCode).toBe(401);
    expect(f.calls).toEqual([]);
  });
  it('removes the organization on the matching phrase and reports the cascade counts',async()=>{
    const f=fixture();
    const out=await invoke(f.handler,req('POST',body));
    expect(out.statusCode).toBe(200);
    expect(out.body).toContain('1 stored key(s) revoked');
    expect(out.body).toContain('3 live token(s) revoked');
    expect(f.calls).toEqual([IDS.org]);
    expect((await invoke(f.handler,req('POST',{...body,orgId:'org-missing'}))).statusCode).toBe(404);
  });
});
