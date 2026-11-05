import {it,expect,describe} from 'vitest';
import {tools,handlers} from '../../src/tools/owner-registrations.js';
import {registry} from '../../src/tools/index.js';
import {isToolAllowed} from '../../src/core/profiles.js';
const read=x=>JSON.parse(x.content[0].text);
function fixture(){
  const state={clients:new Map(),deletions:0};
  state.clients.set('client-fake',{
    clientId:'client-fake',clientName:'Fake Client',
    redirectUris:['https://example.test/callback'],tokenEndpointAuthMethod:'client_secret_post',
    hasClientSecret:true,createdAt:new Date('2026-01-01T00:00:00Z'),
    tokens:{total:2,live:1},pendingCodes:1});
  const audit=[],db={
    listOAuthClients:async()=>[...state.clients.values()],
    getOAuthClientSummary:async id=>state.clients.get(id)??null,
    updateOAuthClient:async({clientId,clientName,redirectUris})=>{
      const row=state.clients.get(clientId);if(!row)return false;
      if(clientName!==undefined)row.clientName=clientName;
      if(redirectUris!==undefined)row.redirectUris=redirectUris;
      return true;
    },
    deleteOAuthClient:async clientId=>{
      if(!state.clients.has(clientId))return null;
      state.clients.delete(clientId);state.deletions++;
      return {tokensRevoked:1,codesRemoved:1};
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
describe('CAP-6 OAuth client registration lifecycle tools',()=>{
  it('exposes full-profile reads and guarded writes; writes visible only to full production connections',()=>{
    expect(tools.map(t=>t.name)).toEqual(['neon_list_oauth_clients','neon_get_oauth_client',
      'neon_update_oauth_client','neon_delete_oauth_client']);
    for(const tool of registry.tools.filter(t=>['neon_update_oauth_client','neon_delete_oauth_client'].includes(t.name))){
      expect(tool).toMatchObject({writes:true,writeContract:'defineWrite-v1',
        productionEffect:'none',profiles:['full']});
      expect(isToolAllowed(tool,{profile:'full'},{productionDeployment:true})).toBe(true);
      expect(isToolAllowed(tool,{profile:'everyday'},{productionDeployment:true})).toBe(false);
      expect(isToolAllowed(tool,{profile:'full'},{productionDeployment:false})).toBe(false);
    }
    const list=registry.tools.find(t=>t.name==='neon_list_oauth_clients');
    expect(list).toMatchObject({writes:false,profiles:['full']});
    expect(tools.find(t=>t.name==='neon_delete_oauth_client'))
      .toMatchObject({access:true,destructive:true});
  });
  it('lists and reads safe summaries with no secret material anywhere',async()=>{
    const f=fixture();
    const listed=read(await handlers.neon_list_oauth_clients({},f.context));
    expect(listed.clients).toHaveLength(1);
    expect(listed.clients[0]).toMatchObject({clientId:'client-fake',hasClientSecret:true,
      tokens:{total:2,live:1}});
    const got=read(await handlers.neon_get_oauth_client({clientId:'client-fake'},f.context));
    expect(got.client.clientName).toBe('Fake Client');
    expect(JSON.stringify(listed)+JSON.stringify(got)).not.toContain('client_secret_hash');
    expect((await handlers.neon_get_oauth_client({clientId:'client-missing'},f.context)).isError).toBe(true);
    expect((await handlers.neon_get_oauth_client({clientId:'bad/id'},f.context)).isError).toBe(true);
  });
  it('delete previews name the client and its live tokens; confirm deletes exactly once',async()=>{
    const f=fixture(),args={clientId:'client-fake'};
    const preview=read(await handlers.neon_delete_oauth_client({...args,dryRun:true},f.context));
    expect(preview.preview).toContain('Fake Client');
    expect(preview.preview).toContain('1 live token(s)');
    expect(preview.needsConfirmation).toBe(true);
    expect(f.state.deletions).toBe(0);
    expect(read(await handlers.neon_delete_oauth_client(args,f.context)).code).toBe('needs_confirmation');
    expect(f.state.deletions).toBe(0);
    expect(read(await handlers.neon_delete_oauth_client({...args,confirm:true},f.context)).confirmed).toBe(true);
    expect(f.state.deletions).toBe(1);
    expect(f.state.clients.has('client-fake')).toBe(false);
    expect(f.audit.some(row=>row.tool==='neon_delete_oauth_client'&&row.confirmed==='true')).toBe(true);
    expect((await handlers.neon_delete_oauth_client({...args,confirm:true},f.context)).isError).toBe(true);
    expect(f.state.deletions).toBe(1);
  });
  it('update changes metadata only after confirmation and refuses an empty update',async()=>{
    const f=fixture();
    expect((await handlers.neon_update_oauth_client({clientId:'client-fake',confirm:true},f.context)).isError).toBe(true);
    const done=read(await handlers.neon_update_oauth_client(
      {clientId:'client-fake',clientName:'Renamed',confirm:true},f.context));
    expect(done.confirmed).toBe(true);
    expect(f.state.clients.get('client-fake').clientName).toBe('Renamed');
    expect(f.state.clients.get('client-fake').hasClientSecret).toBe(true);
    expect((await handlers.neon_update_oauth_client(
      {clientId:'client-fake',redirectUris:['not a url'],confirm:true},f.context)).isError).toBe(true);
    expect((await handlers.neon_update_oauth_client(
      {clientId:'client-missing',clientName:'Nope',confirm:true},f.context)).isError).toBe(true);
  });
});
