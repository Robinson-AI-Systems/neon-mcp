import { describe,expect,it } from 'vitest';
import { createHash } from 'node:crypto';
import { createFakeDb } from '../../test/helpers/fake-db.js';
import { createOneTimeSecrets } from '../../src/core/one-time.js';
import { createSetupHandler } from '../../api/neon/setup.js';
import {configuredSelfResource} from '../../src/core/self-resource.js';
import { createOAuthHandlers } from '../../src/core/oauth-handlers.js';
import { dispatchReadOnlyTool } from '../../src/core/mcp-server.js';
import { registry } from '../../src/tools/index.js';
import {KeySetupError} from '../../src/neon/keys.js';

const fakeKey=n=>Buffer.alloc(32,n).toString('base64url');
const env={PUBLIC_BASE_URL:'https://neon-mcp.example.test',
  ADMIN_PASSPHRASE:'FAKE_owner_password',TOKEN_ENCRYPTION_KEY:fakeKey(23),VERCEL_ENV:'preview'};
function req(method,body={},headers={}) {
  return {method,headers,body:method==='POST'?body:undefined,query:method==='GET'?body:undefined,
    socket:{remoteAddress:'192.0.2.56'}};
}
function res() {
  return {headers:{},statusCode:200,body:null,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.statusCode=n;return this;},
    send(v){this.body=v;return this;},json(v){this.body=JSON.stringify(v);return this;},
    end(){return this;}};
}
async function invoke(fn,request){const r=res();await fn(request,r);return r;}
function fixture() {
  const db=createFakeDb({orgs:[{id:'org-fake-one',label:'Fake Org',
    production_enabled:false,is_default:true}]});
  const events=[];
  const vault={async listKeys(){return [{id:1,kind:'project',project_id:'proj-fake-one',
    last4:'1234',label:'Fake',key_enc:'should-never-appear'}];},
    async storeKey(input){events.push(input);return {projectId:input.projectId,last4:'1234'};},
    async revokeKey(){return true;}};
  const exchange=createOneTimeSecrets({db,env});
  return {db,events,exchange,handler:createSetupHandler({db,vault,exchange,env})};
}
describe('owner-only setup route',()=>{
  it('shows only allowlisted enrollment diagnostics and keeps arbitrary errors private',async()=>{
    const db=createFakeDb();
    let error=new KeySetupError('project_probe_failed',403);
    const vault={storeKey:async()=>{throw error;}};
    const handler=createSetupHandler({db,vault,exchange:{},env});
    const input=req('POST',{action:'add_key',orgId:'org-fake-one',projectId:'proj-fake-one',
      kind:'project',key:'napi_FAKE_private_payload',passphrase:env.ADMIN_PASSPHRASE},
    {origin:env.PUBLIC_BASE_URL});
    const known=await invoke(handler,input);
    expect(known.statusCode).toBe(400);
    expect(known.body).toContain('project_probe_failed / Neon HTTP 403');
    expect(known.body).not.toContain('napi_FAKE_private_payload');
    error=new Error('napi_FAKE_private_payload');
    const unknown=await invoke(handler,input);
    expect(unknown.body).toContain('Action unsuccessful');
    expect(unknown.body).not.toContain(error.message);
  });
  it('permits only the exact rendered stylesheet and preserves browser form origin',async()=>{
    const {handler}=fixture();
    const page=await invoke(handler,req('GET'));
    const css=page.body.match(/<style>([\s\S]*?)<\/style>/)[1];
    const hash=createHash('sha256').update(css).digest('base64');
    expect(page.headers['Referrer-Policy']).toBe('strict-origin');
    expect(page.headers['Content-Security-Policy']).toBe(
      `default-src 'none'; style-src 'sha256-${hash}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    // Null/missing/foreign origins remain denied before credential processing.
    for(const origin of [undefined,'null','https://foreign.example.test']){
      const denied=await invoke(handler,req('POST',{action:'list_keys',orgId:'org-fake-one',
        passphrase:env.ADMIN_PASSPHRASE},{origin}));
      expect(denied.statusCode).toBe(403);
      expect(denied.body).toContain('invalid_origin');
    }
    const accepted=await invoke(handler,req('POST',{action:'list_keys',orgId:'org-fake-one',
      passphrase:env.ADMIN_PASSPHRASE},{origin:env.PUBLIC_BASE_URL}));
    expect(accepted.statusCode).toBe(200);
  });
  it('renders guided stacked credential fields without changing form names or prefilling secrets',async()=>{
    const {handler}=fixture();
    const page=await invoke(handler,req('GET'));
    const add=page.body.match(/<form method="post"><input type="hidden" name="action" value="add_key">([\s\S]*?)<\/form>/)[1];
    const labels=[...add.matchAll(/<label class="field"><span>([^<]+)<\/span>[\s\S]*?<input name="([^"]+)" type="([^"]+)" value="([^"]*)"/g)];
    expect(labels.map(m=>[m[1],m[2],m[3],m[4]])).toEqual([
      ['Organization ID','orgId','text',''],['Organization name','orgLabel','text',''],
      ['Project ID','projectId','text',''],['Neon API key','key','password',''],
      ['Key name','label','text',''],['Administrator passphrase','passphrase','password','']
    ]);
    expect(add).toContain('name="kind" value="project"');
    expect(add).toContain('configured in Vercel as ADMIN_PASSPHRASE');
    expect(page.body).toContain('.field { display: grid;');
    expect(page.body).toContain('@media (max-width: 480px)');
    expect(page.body).not.toContain(env.ADMIN_PASSPHRASE);
  });
  it('renders no secrets, refuses cross-origin posts and requires owner passphrase',async()=>{
    const {handler}=fixture();
    const page=await invoke(handler,req('GET',{once:'fake-once'}));
    expect(page.statusCode).toBe(200);
    expect(page.headers['Cache-Control']).toBe('no-store');
    expect(page.body).toContain('fake-once');
    expect((await invoke(handler,req('POST',{action:'list_keys',orgId:'org-fake-one',
      passphrase:env.ADMIN_PASSPHRASE}))).statusCode).toBe(403);
    const denied=await invoke(handler,req('POST',{action:'list_keys',orgId:'org-fake-one',
      passphrase:'bad'},{origin:env.PUBLIC_BASE_URL}));
    expect(denied.statusCode).toBe(401);
    expect(denied.body).not.toContain('FAKE_owner_password');
  });
  it('reveals a secret once after passphrase, HTML-escapes it, and never caches it',async()=>{
    const {handler,exchange}=fixture();
    const created=await exchange.putOneTimeSecret({kind:'fake',label:'Fake',org:'org-fake-one',
      secret:'fake-<script>alert(1)</script>'});
    const input=req('POST',{action:'view_once',orgId:'org-fake-one',
      onceId:created.id,passphrase:env.ADMIN_PASSPHRASE},{origin:env.PUBLIC_BASE_URL});
    const shown=await invoke(handler,input);
    expect(shown.statusCode).toBe(200);
    expect(shown.body).toContain('&lt;script&gt;');
    expect(shown.body).not.toContain('<script>');
    expect(shown.headers['Cache-Control']).toBe('no-store');
    expect((await invoke(handler,input)).statusCode).toBe(404);
  });
  it('only accepts project keys, never echoes entered keys and supports secure inbound requests',async()=>{
    const {handler,events,exchange}=fixture();
    const headers={origin:env.PUBLIC_BASE_URL};
    const added=await invoke(handler,req('POST',{action:'add_key',orgId:'org-fake-one',
      orgLabel:'Fake Org',projectId:'proj-fake-one',kind:'project',key:'napi_FAKE_ephemeral_fixture',
      label:'Fake',passphrase:env.ADMIN_PASSPHRASE},headers));
    expect(added.statusCode).toBe(200);
    expect(added.body).not.toContain('napi_FAKE_ephemeral_fixture');
    expect(events).toHaveLength(1);
    const org=await invoke(handler,req('POST',{action:'add_key',orgId:'org-fake-one',
      kind:'org',passphrase:env.ADMIN_PASSPHRASE},headers));
    expect(org.statusCode).toBe(400);
    const request=await exchange.requestSecret({org:'org-fake-one',tool:'fake-tool',purpose:'Fake'});
    const supplied=await invoke(handler,req('POST',{action:'submit_secret',orgId:'org-fake-one',
      requestId:request.id,secret:'fake-value',passphrase:env.ADMIN_PASSPHRASE},headers));
    expect(supplied.statusCode).toBe(200);
    expect(supplied.body).not.toContain('fake-value');
    expect(await exchange.takeRequestedSecret({id:request.id,org:'org-fake-one'})).toBe('fake-value');
    const list=await invoke(handler,req('POST',{action:'list_keys',orgId:'org-fake-one',
      passphrase:env.ADMIN_PASSPHRASE},headers));
    expect(list.body).toContain('1234');
    expect(list.body).not.toContain('key_enc');
  });
  it('locks out valid owner passphrase after five wrong attempts',async()=>{
    const {handler}=fixture(),headers={origin:env.PUBLIC_BASE_URL};
    for(let i=0;i<5;i++)expect((await invoke(handler,req('POST',{
      action:'list_keys',orgId:'org-fake-one',passphrase:'wrong'},headers))).statusCode).toBe(401);
    expect((await invoke(handler,req('POST',{action:'list_keys',orgId:'org-fake-one',
      passphrase:env.ADMIN_PASSPHRASE},headers))).statusCode).toBe(429);
  });
});
describe('protected resource owner setup',()=>{
  const envSelf={...env,DATABASE_URL:'postgresql://user:FAKE@localhost/database',
    NEON_MCP_SELF_ORG_ID:'org-fake-one',NEON_MCP_SELF_PROJECT_ID:'prj-self',
    NEON_MCP_SELF_ENDPOINT_HOST:'localhost'};
  function guarded() {
    const db=createFakeDb({orgs:[{id:'org-fake-one',label:'Fake Org',production_enabled:false}]});
    const store=[];
    db.getProtectedResources=async()=>store.at(-1)||[];
    db.saveProtectedResourcesFromSetup=async entries=>{store.push(structuredClone(entries));};
    const vault={listKeys:async()=>[],storeKey:async()=>({}),revokeKey:async()=>false};
    const exchange=createOneTimeSecrets({db,env:envSelf});
    return {handler:createSetupHandler({db,vault,exchange,env:envSelf}),store};
  }
  it('requires owner Vercel self identity and rejects mismatched DB host',()=>{
    expect(configuredSelfResource(envSelf)).toEqual({org:'org-fake-one',project_id:'prj-self'});
    expect(()=>configuredSelfResource({...envSelf,NEON_MCP_SELF_ENDPOINT_HOST:'wrong.example.test'})).toThrow();
    expect(()=>configuredSelfResource({...envSelf,DATABASE_URL:''})).toThrow();
  });
  it('only stores other protected resources; includes self on read and refuses changed owner org',async()=>{
    const {handler,store}=guarded(),headers={origin:envSelf.PUBLIC_BASE_URL};
    const resourcesJson=JSON.stringify([{kind:'self',org:'org-fake-one',
      project_id:'prj-self',label:'Attempt to override self'},
      {kind:'robinson',org:'org-fake-one',project_id:'prj-other',label:'Other server'}]);
    const body={action:'save_protected_resources',orgId:'org-fake-one',
      passphrase:envSelf.ADMIN_PASSPHRASE,resourcesJson};
    expect((await invoke(handler,req('POST',body))).statusCode).toBe(403);
    const saved=await invoke(handler,req('POST',body,headers));
    expect(saved.statusCode).toBe(200);
    expect(store).toEqual([[{kind:'robinson',org:'org-fake-one',project_id:'prj-other',
      label:'Other server'}]]);
    const result=await invoke(handler,req('POST',{action:'list_protected_resources',
      orgId:'org-fake-one',passphrase:envSelf.ADMIN_PASSPHRASE},headers));
    expect(result.body).toContain('Neon MCP own database');
    expect(result.body).toContain('prj-self');
    expect((await invoke(handler,req('POST',{...body,orgId:'org-other'},headers))).statusCode).toBe(403);
  });
  it('refuses invalid JSON, duplicates, missing owner passphrase and injection',async()=>{
    const {handler,store}=guarded(),headers={origin:envSelf.PUBLIC_BASE_URL};
    const body={action:'save_protected_resources',orgId:'org-fake-one',
      passphrase:envSelf.ADMIN_PASSPHRASE,resourcesJson:'not json'};
    expect((await invoke(handler,req('POST',body,headers))).statusCode).toBe(400);
    const duplicate=[{kind:'other',org:'org-fake-one',project_id:'prj-one',label:'A'}];
    expect((await invoke(handler,req('POST',{...body,
      resourcesJson:JSON.stringify([...duplicate,...duplicate])},headers))).statusCode).toBe(400);
    const denied=await invoke(handler,req('POST',{...body,passphrase:'incorrect'},headers));
    expect(denied.statusCode).toBe(401);
    expect(store).toHaveLength(0);
  });
});
describe('MCP read-only boundary and known-key project scope',()=>{
  it('protects A-5 key metadata and never exposes ciphertext',async()=>{
    const db=createFakeDb({orgs:[{id:'org-fake-one',label:'Fake',production_enabled:false}]});
    await db.saveEncryptedNeonKey({orgId:'org-fake-one',kind:'project',projectId:'proj-fake-one',
      keyEnc:'fake-ciphertext-only',last4:'1234',reach:{verified:true}});
    expect(registry.tools.map(t=>t.name)).toEqual(['neon_whoami','neon_list_accounts',
      'neon_enable_production','neon_disable_production',
      'neon_list_connections','neon_recent_changes','neon_get_settings','neon_where_is_setting','neon_revoke_connection','neon_check_key_access','neon_update_settings','neon_get_result','neon_project_list','neon_project_list_regions','neon_project_overview','neon_operation_list','neon_operation_get','neon_project_get_settings','neon_project_rename','neon_project_delete','neon_project_recover','neon_project_create','neon_project_update_settings','neon_project_set_history_retention','neon_project_set_quotas','neon_branch_list','neon_branch_get','neon_branch_compare_schema','neon_branch_rename','neon_branch_set_protected','neon_branch_set_expiration','neon_branch_set_default','neon_branch_create','neon_branch_delete','neon_branch_recover','neon_branch_reset_from_parent','neon_branch_restore',
      'neon_compute_list','neon_compute_get','neon_compute_estimate_cost',
      'neon_compute_create','neon_compute_resize',
      'neon_compute_start','neon_compute_suspend','neon_compute_restart',
      'neon_compute_delete','neon_compute_update_settings',
      'neon_database_list','neon_database_get','neon_role_list','neon_role_get',
      'neon_database_create','neon_database_update','neon_database_delete',
      'neon_role_create',
      'neon_role_reset_password',
      'neon_role_create_read_only','neon_role_delete','neon_role_retirement_review',
      'neon_connection_get_info','neon_connection_show_once','neon_sql_query','neon_sql_explain','neon_sql_list_activity','neon_sql_list_slow_queries','neon_sql_stop_query','neon_sql_preview_change','neon_sql_execute','neon_sql_execute_transaction','neon_schema_list_schemas','neon_schema_list_tables','neon_schema_describe_table','neon_schema_list_extensions','neon_schema_search','neon_schema_list_objects','neon_health_check','neon_health_suggest_indexes','neon_schema_generate_types','neon_schema_get_ddl','neon_schema_list_migrations','neon_branch_compare_data','neon_schema_enable_extension','neon_schema_disable_extension','neon_schema_create_index','neon_schema_drop_index','neon_health_reindex','neon_health_vacuum_analyze','neon_dev_branch_create','neon_dev_list_runs','neon_dev_cleanup','neon_write_guard_readiness','neon_dev_list_scenarios','neon_dev_seed','neon_dev_checkpoint','neon_dev_reset_branch',
      'neon_dev_restore_checkpoint','neon_dev_migration_preview','neon_dev_anonymized_copy',
      'neon_dev_anonymized_status','neon_dev_tune_query',
      'neon_dev_check_integration',
      'neon_snapshot_list','neon_snapshot_delete','neon_snapshot_update','neon_snapshot_create','neon_snapshot_restore','neon_snapshot_set_schedule','neon_security_list_jwks','neon_security_review',
      'neon_security_set_public_access','neon_security_set_ip_allow',
      'neon_security_set_jwks','neon_security_set_audit_log_level',
      'neon_search_tools','neon_call','neon_batch','neon_describe_tool']);
    const connection={neonOrg:'org-fake-one',projectScope:'proj-fake-one',
      mode:'preview',profile:'read_only',listing:'catalog'};
    for(const tool of registry.tools.filter(t=>['neon_whoami','neon_list_accounts'].includes(t.name))) {
      const output=await dispatchReadOnlyTool({registry,name:tool.name,db,connection,args:{}});
      expect(output.isError).not.toBe(true);
      const text=JSON.stringify(output);
      expect(text).toContain('1234');
      expect(text).not.toContain('fake-ciphertext-only');
      expect(text).not.toContain('key_enc');
    }
    const denied=await dispatchReadOnlyTool({registry,name:'neon_list_accounts',db,
      connection:{...connection,neonOrg:'org-fake-other'},args:{}});
    expect(denied.isError).toBe(true);
  });
  it('only offers project scope options verified by a stored key',async()=>{
    const db=createFakeDb({orgs:[{id:'org-fake-one',label:'Fake',production_enabled:false}]});
    const h=createOAuthHandlers({db,env});
    await db.createOAuthClient({clientId:'fake-client',clientSecret:'fake-client-secret',
      redirectUris:['https://client.example.test/cb']});
    await db.saveEncryptedNeonKey({orgId:'org-fake-one',kind:'project',projectId:'proj-fake-one',
      keyEnc:'fake-ciphertext',last4:'1234',reach:{verified:true}});
    const verifier='a'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url');
    const p={client_id:'fake-client',redirect_uri:'https://client.example.test/cb',
      response_type:'code',code_challenge:challenge,code_challenge_method:'S256',
      resource:env.PUBLIC_BASE_URL+'/api/mcp',neon_org:'org-fake-one',
      mode:'preview',profile:'read_only',listing:'catalog'};
    const page=await invoke(h.authorize,req('GET',{...p}));
    expect(page.body).toContain('proj-fake-one');
    expect((await invoke(h.authorize,req('POST',{...p,project_scope:'proj-fake-unknown',
      passphrase:env.ADMIN_PASSPHRASE}))).statusCode).toBe(400);
    const yes=await invoke(h.authorize,req('POST',{...p,project_scope:'proj-fake-one',
      passphrase:env.ADMIN_PASSPHRASE}));
    expect(yes.statusCode).toBe(302);
    const code=new URL(yes.headers.Location).searchParams.get('code');
    const row=await db.consumeAuthCode(code);
    expect(row.project_scope).toBe('proj-fake-one');
  });
});

describe('two-step owner production confirmation route',()=>{
  const ownerEnv={...env,VERCEL_ENV:'production',
    NEON_MCP_LIVE_GATES_APPROVED:'approved-after-X2-X3',
    NEON_MCP_PROTECTED_LIST_CONFIRMED:'owner-confirmed',
    NEON_MCP_SELF_ORG_ID:'org-fake-one',NEON_MCP_SELF_PROJECT_ID:'prj-self',
    NEON_MCP_SELF_ENDPOINT_HOST:'localhost',
    DATABASE_URL:'postgresql://user:FAKE@localhost/database'};
  function productionFixture(overrides={}) {
    const env2={...ownerEnv,...overrides};
    const db=createFakeDb({orgs:[{id:'org-fake-one',label:'Fake Org',production_enabled:false}]});
    let pending=true,enabled=false,disableCalls=0;
    db.getProtectedResources=async()=>[{kind:'robinson',org:'org-fake-one',
      project_id:'prj-other',label:'Other server'}];
    db.completeProductionEnable=async()=>{
      if(!pending)return false;
      pending=false;enabled=true;return true;
    };
    db.disableProduction=async()=>{pending=false;enabled=false;disableCalls++;return true;};
    const vault={listKeys:async()=>[],storeKey:async()=>({}),revokeKey:async()=>false};
    const exchange=createOneTimeSecrets({db,env:env2});
    return {env:env2,handler:createSetupHandler({db,vault,exchange,env:env2}),
      state:()=>({pending,enabled,disableCalls})};
  }
  it('requires owner passphrase, same origin and exact typed phrase after agent request',async()=>{
    const f=productionFixture(),headers={origin:ownerEnv.PUBLIC_BASE_URL};
    const body={action:'approve_production',orgId:'org-fake-one',
      approvalPhrase:'ENABLE_PRODUCTION',passphrase:ownerEnv.ADMIN_PASSPHRASE};
    expect((await invoke(f.handler,req('POST',body))).statusCode).toBe(403);
    expect((await invoke(f.handler,req('POST',{...body,passphrase:'wrong'},headers))).statusCode).toBe(401);
    expect((await invoke(f.handler,req('POST',{...body,approvalPhrase:'yes'},headers))).statusCode).toBe(400);
    expect(f.state().enabled).toBe(false);
    expect((await invoke(f.handler,req('POST',body,headers))).statusCode).toBe(200);
    expect(f.state().enabled).toBe(true);
    expect((await invoke(f.handler,req('POST',body,headers))).statusCode).toBe(409);
    expect((await invoke(f.handler,req('POST',{action:'disable_production',
      orgId:'org-fake-one',passphrase:ownerEnv.ADMIN_PASSPHRASE},headers))).statusCode).toBe(200);
    expect(f.state()).toEqual({pending:false,enabled:false,disableCalls:1});
  });
  it('never permits preview or missing X-2/X-3 owner release to complete approval',async()=>{
    const headers={origin:ownerEnv.PUBLIC_BASE_URL};
    const body={action:'approve_production',orgId:'org-fake-one',
      approvalPhrase:'ENABLE_PRODUCTION',passphrase:ownerEnv.ADMIN_PASSPHRASE};
    for(const config of [{VERCEL_ENV:'preview'}, {NEON_MCP_LIVE_GATES_APPROVED:''},
      {NEON_MCP_PROTECTED_LIST_CONFIRMED:''}]) {
      const f=productionFixture(config);
      expect((await invoke(f.handler,req('POST',body,headers))).statusCode).toBe(403);
      expect(f.state().enabled).toBe(false);
    }
  });
});
