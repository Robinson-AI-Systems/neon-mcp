import {expect,it,describe} from 'vitest';
import {activationEligible} from '../../src/core/owner-activation.js';
import {handlers,tools} from '../../src/tools/owner-production.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {registry} from '../../src/tools/index.js';
const e={VERCEL_ENV:'production',NEON_MCP_LIVE_GATES_APPROVED:'approved-after-X2-X3',
  NEON_MCP_PROTECTED_LIST_CONFIRMED:'owner-confirmed',
  NEON_MCP_SELF_ORG_ID:'org-fake',NEON_MCP_SELF_PROJECT_ID:'prj-self',
  NEON_MCP_SELF_ENDPOINT_HOST:'localhost',
  DATABASE_URL:'postgresql://user:FAKE@localhost/db'};
const read=result=>JSON.parse(result.content[0].text);
function fx(env=e){
  const org={id:'org-fake',production_enabled:false};
  const records=[],pending={current:null};
  const db={
    getNeonOrg:async()=>({...org}),
    getProtectedResources:async()=>[{kind:'robinson',org:'org-fake',project_id:'prj-other',label:'Other server'}],
    async recordWritePreview(row){records.push({kind:'preview',...row});return records.length;},
    async reserveWrite(row){const old=records.find(x=>x.requestKey===row.requestKey);
      if(old)return {created:false,existing:{neon_org:row.orgId,tool:row.tool,
        project_id:row.projectId,branch_id:row.branchId,target:row.target,confirmed:old.confirmed}};
      records.push({...row,confirmed:'pending'});return {created:true,id:records.length};},
    async completeWrite({id,confirmed}){records[id-1].confirmed=confirmed;return true;},
    async requestProductionEnable(){pending.current={expires_at:'2026-10-11T23:59:00Z'};return true;},
    async getPendingProductionEnable(){return pending.current;},
    async disableProduction(){org.production_enabled=false;pending.current=null;return true;}
  };
  return {db,org,pending,records,context:{db,env,connection:{neonOrg:'org-fake',
    profile:'full',mode:'preview',clientId:'fake-client'}}};
}
describe('B-2 production owner controls',()=>{
  it('requires both separate release gate and confirmed list before request',async()=>{
    const f=fx();
    expect(await activationEligible({env:e,db:f.db,orgId:'org-fake'})).toBe(true);
    expect(await activationEligible({env:{...e,NEON_MCP_LIVE_GATES_APPROVED:''},
      db:f.db,orgId:'org-fake'})).toBe(false);
    expect(await activationEligible({env:{...e,VERCEL_ENV:'preview'},
      db:f.db,orgId:'org-fake'})).toBe(false);
    expect(await activationEligible({env:e,db:f.db,orgId:'org-other'})).toBe(false);
  });
  it('offers guarded owner controls to full profile only on production deployment',async()=>{
    expect(tools).toHaveLength(2);
    expect(tools.every(t=>t.writes&&t.writeContract==='defineWrite-v1')).toBe(true);
    const f=fx(),{connection,db}=f.context;
    for(const name of tools.map(t=>t.name)) {
      expect((await dispatchReadOnlyTool({registry,name,args:{confirm:true},
        db,connection:{...connection,profile:'read_only'},env:e})).isError).toBe(true);
      expect((await dispatchReadOnlyTool({registry,name,args:{confirm:true},
        db,connection,env:{...e,VERCEL_ENV:'preview'}})).isError).toBe(true);
    }
  });
  it('preview and missing confirmation never alter permission',async()=>{
    const f=fx(),context=f.context;
    const preview=read(await handlers.neon_enable_production({dryRun:true},context));
    expect(preview.needsConfirmation).toBe(true);
    expect(f.org.production_enabled).toBe(false);
    expect(f.pending.current).toBeNull();
    const unconfirmed=read(await handlers.neon_enable_production({},context));
    expect(unconfirmed.code).toBe('needs_confirmation');
    expect(f.pending.current).toBeNull();
    const confirmed=read(await handlers.neon_enable_production({confirm:true},context));
    expect(confirmed.confirmed).toBe(true);
    expect(f.org.production_enabled).toBe(false); // owner passphrase stage still missing
    expect(f.pending.current).not.toBeNull();
    expect(read(await handlers.neon_disable_production({confirm:true},context)).confirmed).toBe(true);
    expect(f.pending.current).toBeNull();
  });
  it('fails closed before X-2/X-3 or on preview deployment',async()=>{
    const f=fx({...e,NEON_MCP_LIVE_GATES_APPROVED:''});
    expect(read(await handlers.neon_enable_production({confirm:true},f.context)).code).toBe('refused_by_guard');
    expect(f.pending.current).toBeNull();
  });
});
