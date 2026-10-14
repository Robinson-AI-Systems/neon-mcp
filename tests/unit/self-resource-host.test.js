import {describe,it,expect} from 'vitest';
import {configuredSelfResource,canonicalNeonEndpointHost,
 SelfResourceConfigurationError} from '../../src/core/self-resource.js';
import {checkProtectedTarget} from '../../src/core/protected-resources.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';

const safeEnv={
 NEON_MCP_SELF_ORG_ID:'org-owned',
 NEON_MCP_SELF_PROJECT_ID:'project-owned',
 NEON_MCP_SELF_ENDPOINT_HOST:'host-fake.example.invalid',
 DATABASE_URL:'postgresql://owner@host-fake.example.invalid/neondb'
};
const parse=x=>JSON.parse(x.content[0].text);
describe('D-4 self Neon direct/pooler deployment admission',()=>{
 it('matches only exact owner-provided direct or pooler Neon endpoint aliases',()=>{
  const direct=configuredSelfResource(safeEnv);
  const pooled={...safeEnv,DATABASE_URL:
   'postgresql://owner@host-fake-pooler.example.invalid/neondb'};
  expect(configuredSelfResource(pooled)).toEqual(direct);
  expect(configuredSelfResource({...pooled,
   NEON_MCP_SELF_ENDPOINT_HOST:'host-fake-pooler.example.invalid'}))
   .toEqual(direct);
  expect(canonicalNeonEndpointHost('HOST-FAKE-POOLER.EXAMPLE.INVALID'))
   .toBe('host-fake.example.invalid');
  expect(canonicalNeonEndpointHost('host-fake.example.invalid'))
   .toBe('host-fake.example.invalid');
 });
 it('fails closed for mismatched projects, DNS lookalikes and malformed connection data',()=>{
  for(const env of [
   {...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:'host-other.example.invalid'},
   {...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:'host-fake.example.invalid.evil.test'},
   {...safeEnv,DATABASE_URL:'postgresql://owner@host-fake-other-pooler.example.invalid/neondb'},
   {...safeEnv,DATABASE_URL:'https://host-fake.example.invalid/neondb'},
   {...safeEnv,DATABASE_URL:'not-a-uri'},
   {...safeEnv,NEON_MCP_SELF_ORG_ID:null},
   {...safeEnv,NEON_MCP_SELF_PROJECT_ID:''}
  ])expect(()=>configuredSelfResource(env)).toThrow(SelfResourceConfigurationError);
  for(const hostname of ['.host-fake.example.invalid',
   'host-fake..example.invalid','host-fake.example.invalid:5432','*.example.invalid',
   '-pooler.example.invalid','host-fake.example.invalid.','host-fake_pooler.example.invalid'])
   expect(()=>canonicalNeonEndpointHost(hostname)).toThrow();
 });
 it('sends only fixed setup codes, never configured URI or hostnames',()=>{
  for(const [env,code] of [
   [{...safeEnv,NEON_MCP_SELF_ORG_ID:''},'self_identity_missing'],
   [{...safeEnv,DATABASE_URL:'not-a-uri'},'self_database_uri_invalid'],
   [{...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:'bogus host'},'self_endpoint_invalid'],
   [{...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:'host-another.example.invalid'},'self_endpoint_mismatch']
  ]){
   let error;
   try{configuredSelfResource(env)}catch(e){error=e}
   expect(error).toBeInstanceOf(SelfResourceConfigurationError);
   expect(error.code).toBe(code);
   expect(JSON.stringify({message:error.message,code:error.code}))
    .not.toContain('host-fake');
   expect(error.message).not.toContain('host-fake');
  }
 });
 it('continues blocking the server-owned project on either endpoint alias',async()=>{
  const self=configuredSelfResource({...safeEnv,DATABASE_URL:
   'postgresql://owner@host-fake-pooler.example.invalid/neondb'});
  const ctx={db:{getProtectedResources:async()=>[]},
   selfProject:self,connection:{neonOrg:'org-owned'}};
  expect(await checkProtectedTarget({projectId:'project-owned',
   branchId:'br-child'},ctx)).toBe(false);
  expect(await checkProtectedTarget({projectId:'project-other',
   branchId:'br-child'},ctx)).toBe(true);
  expect(await checkProtectedTarget({projectId:'project-other',
   branchId:'br-child'},{...ctx,selfProject:null})).toBe(false);
 });
 it('reports actionable, secret-free self context diagnostics only to full owners',async()=>{
  const item={name:'neon_d4_test_read',writes:false,
   profiles:['read_only','everyday','full']};
  const bad=()=>{throw new SelfResourceConfigurationError('self_endpoint_mismatch')};
  const registry={tools:[item],handlers:{neon_d4_test_read:bad}};
  const context={registry,name:item.name,args:{},db:{},
   env:{VERCEL_ENV:'production'}};
  const full=await dispatchReadOnlyTool({...context,connection:{profile:'full'}});
  const owner=parse(full);
  expect(full.isError).toBe(true);
  expect(owner.code).toBe('self_endpoint_mismatch');
  expect(JSON.stringify(owner)).not.toMatch(/host-fake|host-fake|DATABASE_URL/);
  const read=await dispatchReadOnlyTool({...context,
   connection:{profile:'read_only'}});
  expect(read.isError).toBe(true);
  expect(read.content[0].text).toBe('Could not read account details; check server setup');
 });
});
