import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
const ctx={registry,connection:{profile:'read_only',neonOrg:'org-fake',mode:'preview',listing:'compact'},
 db:{},env:{VERCEL_ENV:'preview'}};
async function run(name,args={},opts={}) {
 return dispatchReadOnlyTool({...ctx,...opts,name,args});
}
const value=output=>JSON.parse(output.content[0].text);
describe('C-2 discovery via authenticated registry',()=>{
 it('returns bounded pages and never reveals unavailable owner controls',async()=>{
  const first=value(await run('neon_search_tools',{limit:2}));
  expect(first.tools).toHaveLength(2);
  expect(first.total).toBeGreaterThan(2);
  expect(first.next).toBe(2);
  const second=value(await run('neon_search_tools',{limit:2,offset:2}));
  expect(second.tools[0].name).not.toBe(first.tools[0].name);
  const all=value(await run('neon_search_tools',{limit:20}));
  expect(all.tools.map(t=>t.name)).not.toContain('neon_enable_production');
  expect(all.tools.map(t=>t.name)).not.toContain('neon_check_key_access');
 });
 it('filters by keyword, area and audience using trusted registry data',async()=>{
  const a=value(await run('neon_search_tools',{query:'result'}));
  expect(a.tools.some(t=>t.name==='neon_get_result')).toBe(true);
  const b=value(await run('neon_search_tools',{area:'discovery',audience:'builder'}));
  expect(b.tools.map(t=>t.name)).toEqual(['neon_search_tools','neon_describe_tool']);
  const c=value(await run('neon_search_tools',{area:'missing'}));
  expect(c.total).toBe(0);
 });
 it('describes only authorized tools, removing internal declarations',async()=>{
  const allowed=value(await run('neon_describe_tool',{name:'neon_whoami'}));
  expect(allowed.tool.name).toBe('neon_whoami');
  expect(allowed.tool.annotations.readOnlyHint).toBe(true);
  expect(allowed.tool).not.toHaveProperty('profiles');
  expect(allowed.tool).not.toHaveProperty('writes');
  for(const name of ['neon_enable_production','neon_check_key_access','neon_nonexistent'])
   expect((await run('neon_describe_tool',{name})).isError).toBe(true);
 });
 it('never exposes an owner-only write through a full connection on a preview deployment',async()=>{
  const owner={...ctx.connection,profile:'full'};
  const found=value(await run('neon_search_tools',{query:'production'},{connection:owner}));
  expect(found.tools.map(t=>t.name)).not.toContain('neon_enable_production');
  expect((await run('neon_describe_tool',{name:'neon_update_settings'},{connection:owner})).isError).toBe(true);
 });
});
