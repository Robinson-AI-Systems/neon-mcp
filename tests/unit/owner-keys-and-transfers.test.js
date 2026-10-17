import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createFakeDb} from '../../test/helpers/fake-db.js';
import {createOneTimeSecrets} from '../../src/core/one-time.js';
const state=vi.hoisted(()=>({read:null,call:null,guards:null,createKeyVault:null}));
vi.mock('../../src/tools/project-context.js',async original=>{
 const base=await original();return {...base,
  projectClient:async(c,_id,{need})=>({client:{},scope:{org:c.connection.neonOrg,scoped:null},
   credentialKind:need==='personal'?'personal':'org',
   credentialOwnerUserId:need==='personal'?'user-owner':null}),
  projectRead:(...args)=>state.read(...args)};
});
vi.mock('../../src/neon/client.js',async original=>{
 const base=await original();return {...base,call:(...args)=>state.call(...args)};
});
vi.mock('../../src/neon/project-write-context.js',()=>({
 createProjectWriteContext:async ctx=>({...ctx,
  deploymentEnv:ctx.env.VERCEL_ENV,writeKey:(name,args)=>'rmcp_'+name+'_'+(args.requestKey??'testrequest123').toLowerCase(),
  guards:state.guards})
}));
vi.mock('../../src/neon/keys.js',async original=>{
 const base=await original();
 return {...base,createKeyVault:(...args)=>state.createKeyVault?.(...args)??base.createKeyVault(...args)};
});
import {handlers as reads,tools as readTools} from '../../src/tools/owner-key-reads.js';
import {handlers as keys,tools as keyTools} from '../../src/tools/owner-key-writes.js';
import {handlers as transfers,tools as transferTools} from '../../src/tools/owner-transfers.js';

const org='org-scratch',project='proj-scratch',dest='org-destination';
const fakeEncryptionKey=Buffer.alloc(32,17).toString('base64url');
const env={VERCEL_ENV:'production',PUBLIC_BASE_URL:'https://neon-mcp.example.test',
 TOKEN_ENCRYPTION_KEY:fakeEncryptionKey,
 NEON_MCP_SELF_ORG_ID:org,NEON_MCP_SELF_PROJECT_ID:'proj-self',
 NEON_MCP_SELF_ENDPOINT_HOST:'localhost'};
const output=value=>JSON.parse(value.content[0].text);
function fixture({production=true,partial=false}={}){
 const db=createFakeDb({orgs:[{id:org,label:'Scratch',production_enabled:production}]});
 const audit=[],claimed=new Map(),events=[],personal=[],organization=[];
 const stats={org,project,dest,personal,organization,
  afterOrg:org,apps:[],integrations:[],createdSecrets:0};
 state.guards={
  checkProtected:async target=>target.projectId!=='proj-blocked',
  checkApp:async target=>target.projectId!=='proj-app',
  checkProduction:async()=>({allowed:production,production:true}),
  checkSpend:async()=>true
 };
 Object.assign(db,{
  recordWritePreview:async row=>{audit.push(['preview',row]);return audit.length},
  reserveWrite:async row=>{
   const prior=claimed.get(row.requestKey);
   if(prior)return {created:false,existing:{...prior,neon_org:org,
    project_id:prior.projectId??null,branch_id:prior.branchId??null}};
   const original={...row,confirmed:'pending'};claimed.set(row.requestKey,original);
   audit.push(['reserve',row]);return {created:true,id:audit.length};
  },
  completeWrite:async row=>{
   audit.push(['complete',row]);
   for(const entry of claimed.values())entry.confirmed=row.confirmed;
  }
 });
 state.read=async(_client,op,p)=>{
  events.push(['read',op,p]);
  if(op==='listApiKeys')return structuredClone(personal);
  if(op==='listOrgApiKeys')return structuredClone(organization);
  if(op==='getProject')return {project:{id:p.path.project_id,org_id:stats.afterOrg}};
  if(op==='listProjectBranches')return {branches:[{id:'br-default',default:true}],pagination:{}};
  if(op==='listProjects')return {
   projects:[{id:project,org_id:stats.afterOrg}],
   ...(partial?{pagination:{cursor:'more'}}:{}),
   applications:{[project]:stats.apps},integrations:{[project]:stats.integrations}
  };
  if(op==='getOrganization')return {id:p.path.org_id,name:'Org'};
  if(op==='getCurrentUserInfo')return {user:{id:'user-owner'}};
  if(op==='getOrganizationMembers')return {
   members:[{member:{org_id:dest,user_id:'user-owner',role:'admin'}}],pagination:{}};
  throw Error('Unexpected read '+op);
 };
 state.call=async(_client,op,p,opts)=>{
  events.push(['write',op,p,opts]);
  if(op==='createApiKey'||op==='createOrgApiKey'){
   const rows=op==='createApiKey'?personal:organization;
   const id=201+rows.length,name=p.body.key_name,created_at='2026-10-17T02:00:00Z';
   rows.push({id,name,created_at,...(p.body.project_id?{project_id:p.body.project_id}:{})});
   return {confirmed:true,data:{id,key:'napi_FAKE_very_long_secret_api_key_'+id}};
  }
  if(op==='revokeApiKey'||op==='revokeOrgApiKey'){
   const rows=op==='revokeApiKey'?personal:organization;
   rows.splice(rows.findIndex(x=>x.id===p.path.key_id),1);
   return {confirmed:true,data:{}};
  }
  if(op==='createProjectTransferRequest')return {confirmed:true,data:{
   id:'transfer-abc',project_id:project,created_at:'2026-10-17T00:00:00Z',
   expires_at:'2026-10-18T00:00:00Z'}};
  if(op==='transferProjectsFromOrgToOrg'){
   stats.afterOrg=dest;return {confirmed:true,data:{}};
  }
  throw Error('Unexpected write '+op);
 };
 state.createKeyVault=()=>({storeOrRotateKey:async args=>{stats.rotated=args;return {id:99}}});
 return {ctx:{connection:{neonOrg:org,mode:production?'production':'preview',profile:'full'},
  db,env},events,stats,db,audit};
}
beforeEach(()=>{state.read=null;state.call=null;state.createKeyVault=null;state.guards=null;});
describe('O-2 verified scoped owner keys',()=>{
 it('advertises all three full-owner API-key tools and two real guarded transfers',()=>{
  expect(readTools.map(x=>x.name)).toEqual(['neon_apikey_list']);
  expect(keyTools.map(x=>x.name)).toEqual(['neon_apikey_create','neon_apikey_revoke']);
  expect(transferTools.map(x=>x.name)).toEqual([
   'neon_transfer_request_create','neon_transfer_projects_between_orgs']);
  for(const t of [...keyTools,...transferTools])
   expect(t).toMatchObject({writes:true,profiles:['full'],
    writeContract:'defineWrite-v1',inputSchema:{additionalProperties:false}});
 });
 it('distinguishes empty, unavailable and server-vault key metadata, never raw tokens',async()=>{
  const f=fixture();
  const seen=output(await reads.neon_apikey_list({},f.ctx));
  expect(seen.personal).toEqual({state:'observed',keys:[]});
  expect(seen.organization).toEqual({state:'observed',keys:[]});
  expect(seen.serverKeys).toEqual([]);
  const text=JSON.stringify(seen);
  expect(text).not.toMatch(/napi_|key_enc|secret|ip_allow/);
  state.read=async()=>{throw Error('provider unavailable');};
  const denied=output(await reads.neon_apikey_list({},f.ctx));
  expect(denied.personal.state).toBe('unavailable');
  expect(denied.organization.state).toBe('unavailable');
 });
 it('returns only a passphrase-controlled one-time link after confirmed key creation',async()=>{
  const f=fixture(),args={kind:'organization',purpose:'automations'};
  const preview=output(await keys.neon_apikey_create({...args,dryRun:true},f.ctx));
  expect(preview.needsConfirmation).toBe(true);
  expect(f.events.some(x=>x[0]==='write')).toBe(false);
  const receipt=output(await keys.neon_apikey_create({...args,confirm:true,requestKey:'secretA123'},f.ctx));
  expect(receipt.done).toBe(true);
  expect(receipt.oneTimeSecretLink).toContain('/api/neon/setup?once=');
  expect(JSON.stringify(receipt)).not.toContain('napi_');
  const ticket=receipt.oneTimeSecretLink.split('once=')[1];
  const escrow=createOneTimeSecrets({db:f.db,env});
  const taken=await escrow.takeOneTimeSecret({org,id:ticket});
  expect(taken.kind).toBe('neon_api_key');
  expect(taken.secret).toContain('napi_FAKE_very_long_secret');
  expect(await escrow.takeOneTimeSecret({org,id:ticket})).toBeNull();
  const again=output(await keys.neon_apikey_create({...args,confirm:true,requestKey:'secretA123'},f.ctx));
  expect(again.done).toBe(true);
  expect(again.oneTimeSecretLink).toBeUndefined();
  expect(f.events.filter(x=>x[0]==='write')).toHaveLength(1);
 });
 it('supports directly verified server encrypted enrollment without returning a token',async()=>{
  const f=fixture();
  const receipt=output(await keys.neon_apikey_create({kind:'organization',purpose:'server',
   storeAsServerKey:true,confirm:true,requestKey:'secretB123'},f.ctx));
  expect(receipt.done).toBe(true);
  expect(f.stats.rotated).toMatchObject({kind:'org',orgId:org,
   providerKeyId:201});
  expect(receipt.oneTimeSecretLink).toBeUndefined();
  expect(JSON.stringify(receipt)).not.toContain('napi_');
 });
 it('refuses revoking an active server credential or prefix family without replacement',async()=>{
  const f=fixture();f.stats.organization.push({id:17,name:'robinson-neon-mcp-server-old',
   created_at:'2026-01-01T00:00:00Z'});
  await f.db.saveEncryptedNeonKey({orgId:org,kind:'org',keyEnc:'cipher',
   last4:'abcd',label:'old',reach:{verified:true,providerKeyId:17}});
  const reply=output(await keys.neon_apikey_revoke({
   kind:'organization',keyId:17,confirm:true,requestKey:'revokeA123'},f.ctx));
  expect(reply.done).toBe(false);
  expect(f.events.filter(x=>x[0]==='write')).toHaveLength(0);
 });
 it('rechecks verified provider ID, audits confirmed revoke, never replays',async()=>{
  const f=fixture();f.stats.organization.push({id:18,name:'external-key',
   created_at:'2026-01-01T00:00:00Z'});
  const args={kind:'organization',keyId:18,requestKey:'revokeB123'};
  expect(output(await keys.neon_apikey_revoke({...args,dryRun:true},f.ctx)).preview).toContain('external-key');
  const done=output(await keys.neon_apikey_revoke({...args,confirm:true},f.ctx));
  expect(done.done).toBe(true);
  expect(f.events.filter(x=>x[0]==='write')).toHaveLength(1);
 });
});
describe('O-2 ownership transfer production and escrow',()=>{
 it('denies production-disabled transfer, without provider POST',async()=>{
  const f=fixture({production:false});
  const result=output(await transfers.neon_transfer_request_create({
   projectId:project,confirm:true},f.ctx));
  expect(result.done).toBe(false);
  expect(f.events.filter(x=>x[0]==='write')).toEqual([]);
 });
 it('shows default branch and integrations in production preview',async()=>{
  const f=fixture();
  f.stats.integrations=['vercel','github'];
  const preview=output(await transfers.neon_transfer_request_create({
   projectId:project,dryRun:true},f.ctx));
  expect(preview.preview).toContain('br-default');
  expect(preview.preview).toContain('vercel');
  expect(preview.preview).toContain('github');
  expect(f.events.some(x=>x[0]==='write')).toBe(false);
 });
 it('escrows exact request credentials instead of inventing a Console URL',async()=>{
  const f=fixture();
  const res=output(await transfers.neon_transfer_request_create({
   projectId:project,confirm:true,requestKey:'transferA123'},f.ctx));
  expect(res.done).toBe(true);
  expect(res.oneTimeSecretLink).toContain('once=');
  expect(JSON.stringify(res)).not.toContain('transfer-abc');
  const taken=await createOneTimeSecrets({db:f.db,env}).takeOneTimeSecret({
   org,id:res.oneTimeSecretLink.split('once=')[1]});
  const info=JSON.parse(taken.secret);
  expect(info).toMatchObject({projectId:project,requestId:'transfer-abc'});
  expect(info).not.toHaveProperty('claimUrl');
 });
 it('verifies destination actor, applies once and reads exact post-transfer ownership',async()=>{
  const f=fixture();
  const args={projectIds:[project],destinationOrgId:dest,requestKey:'transferB123'};
  const plan=output(await transfers.neon_transfer_projects_between_orgs({...args,dryRun:true},f.ctx));
  expect(plan.preview).toContain(dest);
  const result=output(await transfers.neon_transfer_projects_between_orgs({...args,confirm:true},f.ctx));
  expect(result.done).toBe(true);
  expect(f.events.filter(x=>x[0]==='write')).toHaveLength(1);
 });
 it('denies incomplete inventories before a provider ownership operation',async()=>{
  const f=fixture({partial:true});
  const result=output(await transfers.neon_transfer_request_create({
   projectId:project,confirm:true},f.ctx));
  expect(result.done).toBe(false);
  expect(f.events.filter(x=>x[0]==='write')).toHaveLength(0);
 });
});
