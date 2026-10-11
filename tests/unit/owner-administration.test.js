import {it,expect,describe} from 'vitest';
import {tools,handlers} from '../../src/tools/owner-administration.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {registry} from '../../src/tools/index.js';
const read=x=>JSON.parse(x.content[0].text);
function fixture(){
  let state={active:true,revocations:0};
  const audit=[],db={
    getNeonOrg:async id=>id==='org-fake'?{id}:null,
    getActiveScopedConnection:async ({orgId,clientId})=>orgId==='org-fake' &&
      clientId==='client-fake' && state.active?{client_id:clientId,kind:'connector',mode:'preview'}:null,
    revokeScopedConnection:async ({orgId,clientId})=>{
      if(orgId!=='org-fake'||clientId!=='client-fake'||!state.active)return false;
      state.active=false;state.revocations++;return true;
    },
    recordWritePreview:async row=>{audit.push({...row,kind:'preview'});return audit.length;},
    reserveWrite:async row=>{
      const existing=audit.find(x=>x.requestKey===row.requestKey&&x.kind!=='preview');
      if(existing)return {created:false,existing:{...existing,neon_org:row.orgId,
        project_id:row.projectId,branch_id:row.branchId}};
      audit.push({...row,kind:'write',confirmed:'pending'});
      return {created:true,id:audit.length};
    },
    completeWrite:async({id,confirmed})=>{audit[id-1].confirmed=confirmed;return true;}
  };
  const context={db,env:{VERCEL_ENV:'production'},connection:{
    neonOrg:'org-fake',clientId:'owner-client',mode:'preview',profile:'full'}};
  return {context,state,audit,db};
}
describe('B-8b independently guarded revocation',()=>{
  it('exposes one complete write contract only to full production-deployment connections',async()=>{
    expect(tools[0]).toMatchObject({name:'neon_revoke_connection',writes:true,
      writeContract:'defineWrite-v1',productionEffect:'none',access:true,profiles:['full']});
    const f=fixture();
    for(const [connection,env] of [
      [{...f.context.connection,profile:'read_only'},f.context.env],
      [{...f.context.connection,profile:'everyday'},f.context.env],
      [f.context.connection,{VERCEL_ENV:'preview'}]]){
      expect((await dispatchReadOnlyTool({registry,name:'neon_revoke_connection',
        connection,env,db:f.db,args:{clientId:'client-fake',confirm:true}})).isError).toBe(true);
    }
    expect(f.state.revocations).toBe(0);
  });
  it('preview and missing confirmation never revoke; confirmation revokes exactly once',async()=>{
    const f=fixture(),args={clientId:'client-fake'};
    const preview=read(await handlers.neon_revoke_connection({...args,dryRun:true},f.context));
    expect(preview.needsConfirmation).toBe(true);
    expect(f.state.active).toBe(true);
    expect(read(await handlers.neon_revoke_connection(args,f.context)).code).toBe('needs_confirmation');
    expect(f.state.revocations).toBe(0);
    expect(read(await handlers.neon_revoke_connection({...args,confirm:true},f.context)).confirmed).toBe(true);
    expect(f.state.revocations).toBe(1);
    const outcome=await handlers.neon_revoke_connection({...args,confirm:true},f.context);
    expect(outcome.isError).toBe(true);
    expect(f.state.revocations).toBe(1);
    expect(JSON.stringify(f.audit)).not.toContain('token_hash');
  });
  it('refuses forged other-organization selection, invalid ID and preview-deployment execution',async()=>{
    const f=fixture(),{connection}=f.context;
    const bad=await handlers.neon_revoke_connection({clientId:'other-client',confirm:true},f.context);
    expect(bad.isError).toBe(true);
    expect(f.state.active).toBe(true);
    expect((await handlers.neon_revoke_connection({clientId:'bad/token',confirm:true},f.context)).isError).toBe(true);
    expect((await handlers.neon_revoke_connection({clientId:'client-fake',confirm:true},{
      ...f.context,connection:{...connection,profile:'read_only'}})).isError).toBe(true);
    expect(f.state.revocations).toBe(0);
  });
});
