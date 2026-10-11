import {describe,it,expect} from 'vitest';
import {handlers,tools} from '../../src/tools/owner-reads.js';
import {dashboardSetting} from '../../src/data/dashboard-map.js';
const read=x=>JSON.parse(x.content[0].text);
const ctx={connection:{neonOrg:'org-fake'},db:{
  listConnectionSummaries:async(org,limit)=>[{client_id:'fake-client',kind:'connector',mode:'preview',org,limit}],
  listRecentChanges:async()=>[{id:1,tool:'neon_dummy',summary:'owner@example.test updated',
    before:{email:'x@y.test'}}],
  listSafeSettings:async()=>[{key:'protected_resources',value:[{org:'org-fake',project_id:'prj-1'},
    {org:'other',project_id:'prj-2'}]},{key:'default_region',value:'aws-us-east-1'}]
}};
describe('B-8a safe server reads',()=>{
  it('registers four read-only profile-safe tools',()=>{
    expect(tools).toHaveLength(4);
    for(const item of tools){expect(item.writes).toBe(false);expect(item.profiles).toContain('read_only');}
  });
  it('scopes connection reads and never returns token hashes',async()=>{
    const out=read(await handlers.neon_list_connections({limit:2},ctx));
    expect(out.connections[0].org).toBe('org-fake');
    expect(JSON.stringify(out)).not.toContain('token_hash');
  });
  it('hides email and nested audit snapshots',async()=>{
    const out=read(await handlers.neon_recent_changes({},ctx));
    expect(out.changes[0].summary).toContain('[hidden email]');
    expect(out.changes[0].before).toEqual({});
  });
  it('filters protected resource entries belonging to other organizations',async()=>{
    const out=read(await handlers.neon_get_settings({},ctx));
    expect(out.settings[0].value).toHaveLength(1);
    expect(out.settings[0].value[0].org).toBe('org-fake');
  });
  it('returns structured unperformed console steps',async()=>{
    for(const name of ['plan','payment_method','sso','integrations','vercel_preview_branches',
      'branch_protection','ip_allow']){
      const x=read(await handlers.neon_where_is_setting({setting:name},ctx));
      expect(x.steps[0].n).toBe(1);expect(x.performed).toBe(false);
      expect(dashboardSetting(name).url).toMatch(/^https:/);
    }
    expect((await handlers.neon_where_is_setting({setting:'unknown'},ctx)).isError).toBe(true);
  });
  it('refuses absent organization context',async()=>{
    await expect(handlers.neon_get_settings({}, {connection:{},db:ctx.db})).rejects.toThrow();
  });
});
