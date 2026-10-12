import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,AT,project} from '../../test/helpers/neon-fixtures.js';
import {projectScope} from '../../src/tools/project-context.js';
import {createSecurityReadHandlers,tools} from '../../src/tools/security.js';

const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'}};
const row={id:'jwks-fake-000001',project_id:IDS.project,
 provider_name:'FakeOIDC',jwks_url:'https://issuer.example.test/.well-known/jwks.json',
 created_at:AT,updated_at:AT,role_names:['authenticated']};
function make({projectRow=project(),entries=[row]}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_jwks',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:projectRow});
 fake.when('getProjectJWKS').resolves({jwks:entries});
 const handler=createSecurityReadHandlers({getClient:async(c,p)=>({
  client,scope:projectScope(c,p)})}).neon_security_list_jwks;
 return {fake,handler};
}
const json=x=>JSON.parse(x.content[0].text);
describe('D-8 scoped, secret-safe JWKS trust reads',()=>{
 it('declares a safe read in every connection profile with a closed schema',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_security_list_jwks',
   writes:false,area:'security'});
  expect(tools[0].profiles).toContain('read_only');
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('verifies project identity, summarizes issuers and never fetches a JWT key',async()=>{
  const f=make();
  const result=json(await f.handler({},ctx));
  expect(result.total).toBe(1);
  expect(result.complete).toBe(true);
  expect(result.issuers[0]).toMatchObject({id:row.id,
   issuerHost:'issuer.example.test',jwksUrl:row.jwks_url,
   provider:'FakeOIDC',urlRedacted:false,roles:['authenticated']});
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  expect(f.fake.calls.filter(x=>x.operationId==='getProjectJWKS')).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('napi_FAKE');
  f.fake.assertClean();
 });
 it('never returns URL query secrets and does not fetch remote JWKS',async()=>{
  const f=make({entries:[{...row,
   jwks_url:'https://issuer.example.test/.well-known/jwks.json?token=FAKE_SENSITIVE'}]});
  const result=json(await f.handler({},ctx));
  expect(result.issuers[0]).toMatchObject({jwksUrl:null,
   issuerHost:'issuer.example.test',urlRedacted:true});
  expect(JSON.stringify(result)).not.toContain('FAKE_SENSITIVE');
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('refuses outside-project access before API reads',async()=>{
  const f=make();
  await expect(f.handler({projectId:'proj-fake-other'},ctx)).rejects.toThrow(/scope/);
  expect(f.fake.calls).toHaveLength(0);
 });
 it('rejects duplicate and foreign JWKS entries or incorrect project identity',async()=>{
  for(const params of [
   {entries:[row,row]},
   {entries:[{...row,project_id:'proj-fake-other'}]},
   {projectRow:project({org_id:'org-fake-other'})}
  ]){
   const f=make(params);
   await expect(f.handler({},ctx)).rejects.toThrow();
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('never treats arbitrary URL credentials as a safe issuer URL',async()=>{
  const f=make({entries:[{...row,
   jwks_url:'https://fake-user:FAKE_PASS@issuer.example.test/.well-known/jwks.json'}]});
  const result=json(await f.handler({},ctx));
  expect(result.issuers[0].jwksUrl).toBeNull();
  expect(result.issuers[0].urlRedacted).toBe(true);
  expect(JSON.stringify(result)).not.toContain('FAKE_PASS');
  f.fake.assertClean();
 });
});
