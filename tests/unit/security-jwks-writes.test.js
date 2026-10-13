import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,AT,project,devBranch,responses} from '../../test/helpers/neon-fixtures.js';
import {tools,createSecurityJwksWriteHandlers} from '../../src/tools/security-jwks-writes.js';
const json=r=>JSON.parse(r.content[0].text);
const old={id:'jwks-fake-000001',project_id:IDS.project,
 provider_name:'PriorOIDC',jwks_url:'https://prior.example.test/jwks.json',
 created_at:AT,updated_at:AT,branch_id:IDS.dev,jwt_audience:'prior-aud'};
const fresh={...old,id:'jwks-fake-000002',provider_name:'NewOIDC',
 jwks_url:'https://new.example.test/jwks.json',jwt_audience:'new-aud'};
const add={action:'add',branchId:IDS.dev,provider:'NewOIDC',
 url:fresh.jwks_url,audience:'new-aud'};
const remove={action:'remove',jwksId:old.id};
// Model an allowed root record with an absent optional parent field.
const parentless=devBranch();
delete parentless.parent_id;
function fixture({allowed=true,profile='full',production=true}={}){
 const fake=makeFakeNeon(),audit=[];
 const client=makeNeonClient({key:'napi_FAKE_jwks_write',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile,
  mode:production?'production':'preview'},clientFor:async()=>client,
  db:{
   recordWritePreview:async x=>audit.push({kind:'preview',...x}),
   reserveWrite:async x=>{audit.push({kind:'reserve',...x});return {created:true,id:12}},
   completeWrite:async x=>audit.push({kind:'complete',...x})
  },writeKey:()=> 'rmcp_jwks_trust_fixture_123456',
  guards:{checkProtected:async()=>allowed,
   checkProduction:async()=>({allowed:allowed&&production,production}),
   checkApp:async()=>allowed,checkSpend:async()=>allowed}};
 const h=createSecurityJwksWriteHandlers({contextFor:async()=>ctx}).neon_security_set_jwks;
 return {fake,ctx,audit,h};
}
function reads(f,lists,projectRow=project()){
 f.fake.when('getProject').resolves({project:projectRow});
 const jwks=f.fake.when('getProjectJWKS');
 for(const entries of lists)jwks.resolves({jwks:entries});
}
describe('D-8 scope-bound JWT issuer trust lifecycle',()=>{
 it('publishes full-owner B-1 audited access write only',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_security_set_jwks',
   profiles:['full'],writes:true,access:true,projectWide:true,
   writeContract:'defineWrite-v1'});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('previews revoking an exact known issuer without any write or secret return',async()=>{
  const f=fixture();reads(f,[[old]]);
  const result=json(await f.h({...remove,dryRun:true},{}));
  expect(result.preview).toContain(old.id);
  expect(result.needsConfirmation).toBe(true);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  expect(f.audit.some(x=>x.kind==='preview')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('napi_FAKE');
  f.fake.assertClean();
 });
 it('revokes only one scoped issuer, checks full updated list, audits confirmed',async()=>{
  const f=fixture();reads(f,[[old],[old],[]]);
  f.fake.when('deleteProjectJWKS').resolves(old);
  const result=json(await f.h({...remove,confirm:true},{}));
  expect(result).toMatchObject({done:true,confirmed:true});
  const deleted=f.fake.calls.filter(x=>x.method==='DELETE');
  expect(deleted).toHaveLength(1);
  expect(deleted[0]).toMatchObject({operationId:'deleteProjectJWKS',
   params:{project_id:IDS.project,jwks_id:old.id},auth:true});
  expect(f.audit.some(x=>x.kind==='complete'&&x.confirmed==='true')).toBe(true);
  f.fake.assertClean();
 });
 it('adds only a verified unprotected-branch issuer with explicit audience',async()=>{
  const f=fixture();reads(f,[[old],[old],[old,fresh]]);
  f.fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'))
   .resolves(responses.getProjectBranch('dev'))
   .resolves(responses.getProjectBranch('dev'));
  f.fake.when('addProjectJWKS').resolves({jwks:fresh,operations:[]});
  const result=json(await f.h({...add,confirm:true},{}));
  expect(result).toMatchObject({done:true,confirmed:true});
  const created=f.fake.calls.filter(x=>x.method==='POST');
  expect(created).toHaveLength(1);
  expect(created[0].body).toEqual({jwks_url:fresh.jwks_url,
   provider_name:'NewOIDC',branch_id:IDS.dev,jwt_audience:'new-aud',
   skip_role_creation:true});
  expect(created[0].auth).toBe(true);
  expect(f.fake.calls.some(x=>x.operationId==='getProjectBranch')).toBe(true);
  f.fake.assertClean();
 });
 it('rejects default/protected and foreign branch identity before creating trust',async()=>{
  for(const b of [devBranch({protected:true}),devBranch({default:true}),
   devBranch({project_id:'proj-fake-other'}),parentless,
   devBranch({parent_id:IDS.dev})]){
   const f=fixture();reads(f,[[old]]);
   f.fake.when('getProjectBranch').resolves({...responses.getProjectBranch('dev'),branch:b});
   const result=json(await f.h({...add,confirm:true},{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('fails closed if issuer branch becomes protected, default, or foreign after preview',async()=>{
  for(const mutation of [devBranch({protected:true}),devBranch({default:true}),
   devBranch({project_id:'proj-fake-other'})]){
   const f=fixture();reads(f,[[old],[old]]);
   f.fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'))
    .resolves({...responses.getProjectBranch('dev'),branch:mutation});
   const result=json(await f.h({...add,confirm:true},{}));
   expect(result).toMatchObject({done:false,confirmed:'pending'});
   expect(f.fake.calls.filter(x=>x.method==='POST')).toHaveLength(0);
   expect(f.fake.calls.filter(x=>x.operationId==='getProjectBranch')).toHaveLength(2);
   expect(f.audit.some(x=>x.kind==='reserve')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('never confirms newly added trust if its source branch changes after POST',async()=>{
  for(const mutation of [devBranch({protected:true}),devBranch({default:true}),
   parentless,devBranch({name:'unexpected-rename'})]){
   const f=fixture();reads(f,[[old],[old],[old,fresh]]);
   f.fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'))
    .resolves(responses.getProjectBranch('dev'))
    .resolves({...responses.getProjectBranch('dev'),branch:mutation});
   f.fake.when('addProjectJWKS').resolves({jwks:fresh,operations:[]});
   const result=json(await f.h({...add,confirm:true},{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.filter(x=>x.operationId==='addProjectJWKS')).toHaveLength(1);
   expect(f.audit.some(x=>x.kind==='complete'&&x.confirmed!=='true')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses missing exact issuer, duplicate trust and malformed URL without writes',async()=>{
  for(const a of [
   {...remove,jwksId:'jwks-fake-not-found'},
   {...add,url:'https://issuer.example.test/jwks?secret=FAKE_SENSITIVE'},
   {...add,url:'https://user:FAKE_PASS@issuer.example.test/jwks'},
   {...add,url:'https://127.0.0.1/jwks'},
   {...add,url:'http://issuer.example.test/jwks'},
   {...add,url:old.jwks_url},
   {...add,audience:undefined}
  ]){
   const f=fixture();reads(f,[[old]]);
   const result=json(await f.h({...a,confirm:true},{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses foreign project metadata, owner/production/app and cross-scope access',async()=>{
  for(const options of [{profile:'everyday'},{production:false},{allowed:false}]){
   const f=fixture(options);reads(f,[[old]]);
   const result=json(await f.h({...remove,confirm:true},{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
  const foreign=fixture();reads(foreign,[[old]],project({org_id:'org-fake-other'}));
  expect(json(await foreign.h({...remove,confirm:true},{})).done).toBe(false);
  const outside=fixture();expect(json(await outside.h({
   ...remove,projectId:'proj-fake-other',confirm:true},{})).done).toBe(false);
  expect(outside.fake.calls).toHaveLength(0);
 });
 it('marks concurrent provider drift uncertain and refuses replay of the write',async()=>{
  const f=fixture();reads(f,[[old],[old,fresh]]);
  const result=json(await f.h({...remove,confirm:true},{}));
  expect(result.done).toBe(false);
  expect(result.confirmed).toBe('pending');
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('does not confirm a removal when the issuer remains trusted',async()=>{
  const f=fixture();reads(f,[[old],[old],[old]]);
  f.fake.when('deleteProjectJWKS').resolves(old);
  const result=json(await f.h({...remove,confirm:true},{}));
  expect(result).toMatchObject({done:false,confirmed:false});
  expect(f.fake.calls.filter(x=>x.method==='DELETE')).toHaveLength(1);
  f.fake.assertClean();
 });
});
