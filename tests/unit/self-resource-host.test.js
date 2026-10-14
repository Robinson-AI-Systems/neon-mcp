import {describe,it,expect} from 'vitest';
import {configuredSelfResource,canonicalNeonEndpointHost,
 SelfResourceConfigurationError} from '../../src/core/self-resource.js';
import {checkProtectedTarget} from '../../src/core/protected-resources.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';

// All hostnames and URLs below are dynamically assembled, fictional test data.
// Only actual Neon ep-* hosts may have the real -pooler alias.
const domain=['us-east-2','aws','neon','tech'].join('.');
const host=(name='ep-fake')=>name+'.'+domain;
const uri=hostname=>['postgresql://owner@',hostname,'/neondb'].join('');
const safeEnv={
 NEON_MCP_SELF_ORG_ID:'org-owned',
 NEON_MCP_SELF_PROJECT_ID:'project-owned',
 NEON_MCP_SELF_ENDPOINT_HOST:host(),
 DATABASE_URL:uri(host())
};
const parse=x=>JSON.parse(x.content[0].text);

describe('D-4 self project exact endpoint admission',()=>{
 it('matches only exact Neon-issued direct and -pooler aliases',()=>{
  const direct=configuredSelfResource(safeEnv);
  const pooled={...safeEnv,DATABASE_URL:uri(host('ep-fake-pooler'))};
  expect(configuredSelfResource(pooled)).toEqual(direct);
  expect(configuredSelfResource({...pooled,
   NEON_MCP_SELF_ENDPOINT_HOST:host('ep-fake-pooler')})).toEqual(direct);
  expect(canonicalNeonEndpointHost(host('EP-FAKE-POOLER').toUpperCase()))
   .toBe(host());
  expect(canonicalNeonEndpointHost(host())).toBe(host());
 });
 it('does not equate custom CNAMEs, lookalikes, or unrelated project endpoints',()=>{
  const mismatches=[
   {...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:host('ep-other')},
   {...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:host()+'.evil.test'},
   {...safeEnv,DATABASE_URL:uri(host('ep-other-pooler'))},
   {...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:'db.example.invalid',
    DATABASE_URL:uri('db-pooler.example.invalid')},
   {...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:'host-fake.example.invalid',
    DATABASE_URL:uri('host-fake-pooler.example.invalid')},
   {...safeEnv,DATABASE_URL:'not-a-uri'},
   {...safeEnv,NEON_MCP_SELF_ORG_ID:null},
   {...safeEnv,NEON_MCP_SELF_PROJECT_ID:''}
  ];
  for(const env of mismatches)
   expect(()=>configuredSelfResource(env)).toThrow(SelfResourceConfigurationError);
  expect(canonicalNeonEndpointHost('db-pooler.example.invalid'))
   .toBe('db-pooler.example.invalid');
  expect(canonicalNeonEndpointHost('host-fake-pooler.example.invalid'))
   .not.toBe('host-fake.example.invalid');
  for(const invalid of ['.'+host(),host('ep-fake..bad'),
   host()+':5432','*.'+domain,'-pooler.'+domain,host()+'.',
   'host_fake.example.invalid'])
   expect(()=>canonicalNeonEndpointHost(invalid)).toThrow();
 });
 it('returns stable codes only without connection, environment, or host values',()=>{
  for(const [env,code] of [
   [{...safeEnv,NEON_MCP_SELF_ORG_ID:''},'self_identity_missing'],
   [{...safeEnv,DATABASE_URL:'not-a-uri'},'self_database_uri_invalid'],
   [{...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:'bogus host'},'self_endpoint_invalid'],
   [{...safeEnv,NEON_MCP_SELF_ENDPOINT_HOST:host('ep-other')},'self_endpoint_mismatch']
  ]){
   let error;
   try{configuredSelfResource(env)}catch(e){error=e}
   expect(error).toBeInstanceOf(SelfResourceConfigurationError);
   expect(error.code).toBe(code);
   const report=JSON.stringify({message:error.message,code:error.code});
   expect(report).not.toContain(host());
   expect(report).not.toContain('postgresql:');
  }
 });
 it('still prohibits mutations targeting its own project on either host alias',async()=>{
  const self=configuredSelfResource({...safeEnv,
   DATABASE_URL:uri(host('ep-fake-pooler'))});
  const ctx={db:{getProtectedResources:async()=>[]},
   selfProject:self,connection:{neonOrg:'org-owned'}};
  expect(await checkProtectedTarget({projectId:'project-owned',
   branchId:'br-child'},ctx)).toBe(false);
  expect(await checkProtectedTarget({projectId:'project-other',
   branchId:'br-child'},ctx)).toBe(true);
  expect(await checkProtectedTarget({projectId:'project-other',
   branchId:'br-child'},{...ctx,selfProject:null})).toBe(false);
 });
 it('gives authenticated full owners a safe code but not lower-privilege readers',async()=>{
  const item={name:'neon_d4_test_read',writes:false,
   profiles:['read_only','everyday','full']};
  const failure=()=>{throw new SelfResourceConfigurationError('self_endpoint_mismatch')};
  const registry={tools:[item],handlers:{neon_d4_test_read:failure}};
  const c={registry,name:item.name,args:{},db:{},env:{VERCEL_ENV:'production'}};
  const full=await dispatchReadOnlyTool({...c,connection:{profile:'full'}});
  expect(full.isError).toBe(true);
  const result=parse(full);
  expect(result.code).toBe('self_endpoint_mismatch');
  expect(JSON.stringify(result)).not.toContain(host());
  const lower=await dispatchReadOnlyTool({...c,
   connection:{profile:'read_only'}});
  expect(lower.isError).toBe(true);
  expect(lower.content[0].text).toBe('Could not read account details; check server setup');
 });
});
