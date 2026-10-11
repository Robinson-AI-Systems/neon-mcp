import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {listVisibleToolMetadata,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
const connection={profile:'read_only',listing:'compact',mode:'preview',neonOrg:'org-fake'};
const listing=(params={})=>listVisibleToolMetadata({registry,connection,env:{VERCEL_ENV:'preview'},...params});
describe('C-2 listing modes and strict profile boundaries',()=>{
 it('compact mode includes only the gateway, whoami, handle retrieval and approved workflows',()=>{
  const names=listing().map(t=>t.name);
  expect(names).toEqual(['neon_whoami','neon_get_result','neon_search_tools',
   'neon_call','neon_batch','neon_describe_tool']);
  expect(names).not.toContain('neon_list_accounts');
  expect(names).not.toContain('neon_enable_production');
 });
 it('catalog includes all authorized names but not restricted writes',()=>{
  const names=listing({listing:'catalog'}).map(t=>t.name);
  expect(names).toContain('neon_list_accounts');
  expect(names).toContain('neon_search_tools');
  expect(names).not.toContain('neon_enable_production');
  expect(names).not.toContain('neon_check_key_access');
 });
 it('an explicit listing override never grants a denied tool',()=>{
  const full={...connection,profile:'full'};
  const preview=listing({connection:full,listing:'catalog'}).map(t=>t.name);
  expect(preview).not.toContain('neon_update_settings');
  const prod=listing({connection:full,listing:'catalog',env:{VERCEL_ENV:'production'}}).map(t=>t.name);
  expect(prod).toContain('neon_update_settings');
  const compact=listing({connection:full,listing:'compact',env:{VERCEL_ENV:'production'}}).map(t=>t.name);
  expect(compact).not.toContain('neon_update_settings');
  const invalid=listing({listing:'not-a-mode'}).map(t=>t.name);
  expect(invalid).toEqual(listing().map(t=>t.name));
 });
 it('compact listings retain descriptions, schemas and safety annotations',()=>{
  for(const tool of listing()){
   expect(tool.inputSchema.type).toBe('object');
   expect(tool.annotations).toBeDefined();
   expect(tool).not.toHaveProperty('profiles');
  }
 });
 it('tools hidden from compact remain callable if profile permits them',async()=>{
  const result=await dispatchReadOnlyTool({registry,name:'neon_list_accounts',args:{},
   connection,db:{listNeonOrgs:async()=>[{id:'org-fake',label:'safe'}],
    listNeonKeySummaries:async()=>[]},env:{VERCEL_ENV:'preview'}});
  expect(result.isError).not.toBe(true);
 });
});
