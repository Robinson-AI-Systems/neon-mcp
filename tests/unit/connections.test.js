import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,database,role,devEndpoint,responses} from '../../test/helpers/neon-fixtures.js';
import {tools,createConnectionHandlers} from '../../src/tools/connections.js';
const json=x=>JSON.parse(x.content[0].text);
const chosen={branchId:IDS.dev,endpointId:IDS.devEndpoint,
 databaseName:'neondb',roleName:'neondb_owner'};
const directHost=devEndpoint().host;
const direct='postgresql://neondb_owner:npg_FAKE_private_connection@'+directHost+
 '/neondb?sslmode=require';
const pooled='postgresql://neondb_owner:npg_FAKE_private_connection@'+
 directHost.replace(/^([^.]+)/,'$1-pooler')+'/neondb?sslmode=require';
function fakeSetup({allowed=true,exchange=true,hostAlias=false,pooledEnabled=false}={}){
 const fake=makeFakeNeon(),audit=[],saved=[];
 const client=makeNeonClient({key:'napi_FAKE_D4_connection',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const env={PUBLIC_BASE_URL:'https://fake-owner.invalid',
  TOKEN_ENCRYPTION_KEY:'A'.repeat(43)};
 const db={recordWritePreview:async x=>audit.push(x),
  reserveWrite:async x=>{audit.push(x);return {created:true,id:audit.length}},
  completeWrite:async x=>audit.push(x),
  ...(exchange?{saveOneTimeSecret:async x=>saved.push(x),
    consumeSecretRequest:async()=>null}:{})};
 const context={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:'preview',profile:'full'},db,env,
  clientFor:async()=>client,deploymentEnv:'production',
  writeKey:()=> 'rmcp_connection_once_123456789',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),checkSpend:async()=>true}};
 const callers={getClient:async()=>({client}),contextFor:async()=>context,
  testConnection:async()=>({verified:true})};
 const handlers=createConnectionHandlers(callers);
 const reads=()=>{
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({
   pooler_enabled:pooledEnabled,
   ...(hostAlias?{branch_id:IDS.main}:{})})});
  fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev)});
  fake.when('getProjectBranchRole').resolves({role:role(IDS.dev)});
 };
 return {fake,audit,saved,handlers,context,reads};
}
describe('D-4 independently scoped connection secret boundary',()=>{
 it('separates broad safe information from full-owner guarded URI delivery',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_connection_get_info',
   'neon_connection_show_once']);
  expect(tools[0].writes).toBe(false);
  expect(tools[0].profiles).toContain('read_only');
  expect(tools[1]).toMatchObject({writes:true,secret:true,access:true,
   oneTimeOnly:true,secretRoute:'/api/neon/setup'});
  expect(tools[1].profiles).toEqual(['full']);
  expect(tools.every(t=>t.inputSchema.additionalProperties===false)).toBe(true);
 });
 it('returns safe direct host, snippets and optional authorized test but never provider URI',async()=>{
  const f=fakeSetup();f.reads();
  f.fake.when('getConnectionUri').resolves({uri:direct});
  const first=json(await f.handlers.neon_connection_get_info(chosen,f.context));
  expect(first).toMatchObject({host:directHost,pooledHost:null,
   sslMode:'require',database:'neondb',role:'neondb_owner',
   privilegesVerified:false,testPerformed:false});
  expect(first.snippets.psql).toContain('$DATABASE_URL');
  const test=json(await f.handlers.neon_connection_get_info({...chosen,test:true},f.context));
  expect(test.connectionTest.verified).toBe(true);
  expect(JSON.stringify({first,test})).not.toMatch(/npg_FAKE|postgresql:\/\/|private_connection/);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('requires exact direct/pooler host identities and verified branch before output',async()=>{
  const f=fakeSetup({pooledEnabled:true});f.reads();
  f.fake.when('getConnectionUri').resolves({uri:direct}).resolves({uri:pooled});
  const value=json(await f.handlers.neon_connection_get_info(chosen,f.context));
  expect(value.pooledHost).toContain('-pooler.');
  f.fake.assertClean();
  const wrong=fakeSetup();wrong.reads();
  wrong.fake.when('getConnectionUri').resolves({uri:pooled});
  await expect(wrong.handlers.neon_connection_get_info(chosen,wrong.context))
   .rejects.toThrow(/URI/);
  wrong.fake.assertClean();
  const cross=fakeSetup({hostAlias:true});cross.reads();
  await expect(cross.handlers.neon_connection_get_info(chosen,cross.context))
   .rejects.toThrow(/identity/);
  expect(cross.fake.calls.some(c=>c.operationId==='getConnectionURI')).toBe(false);
  cross.fake.assertClean();
 });
 it('owner confirms once, stores only ciphertext and receives a one-time link',async()=>{
  const f=fakeSetup();f.reads();
  f.fake.when('getConnectionUri').resolves({uri:direct});
  const preview=json(await f.handlers.neon_connection_show_once({
   ...chosen,dryRun:true},f.context));
  expect(preview.done).toBe(false);
  expect(f.fake.calls.some(c=>c.operationId==='getConnectionURI')).toBe(false);
  expect(json(await f.handlers.neon_connection_show_once(chosen,f.context)).code)
   .toBe('needs_confirmation');
  const done=json(await f.handlers.neon_connection_show_once({
   ...chosen,confirm:true},f.context));
  expect(done.confirmed).toBe(true);
  expect(done.oneTimeSecretLink).toMatch(/^https:\/\/fake-owner.invalid\/api\/neon\/setup\?once=/);
  expect(f.saved).toHaveLength(1);
  expect(f.saved[0].ciphertext).toMatch(/^v1\./);
  expect(JSON.stringify({done,audit:f.audit})).not.toMatch(/npg_FAKE|postgresql:\/\/|private_connection/);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('denies absent encrypted storage and guarded sensitive connections before URI request',async()=>{
  const absent=fakeSetup({exchange:false});
  const no=json(await absent.handlers.neon_connection_show_once({
   ...chosen,confirm:true},absent.context));
  expect(no.done).toBe(false);
  expect(absent.fake.calls).toHaveLength(0);
  const blocked=fakeSetup({allowed:false});blocked.reads();
  const response=json(await blocked.handlers.neon_connection_show_once({
   ...chosen,confirm:true},blocked.context));
  expect(response.done).toBe(false);
  expect(blocked.fake.calls.some(c=>c.operationId==='getConnectionURI')).toBe(false);
  blocked.fake.assertClean();
 });
});
