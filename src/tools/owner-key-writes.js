// O-2: independently verified provider key management, auditable writes and safe handoff.
import {defineWrite} from '../core/write.js';
import {call} from '../neon/client.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {createKeyVault} from '../neon/keys.js';
import {projectClient,projectRead} from './project-context.js';
import {checkSecretStorage} from './role-write-shared.js';

const ID=/^[a-z0-9-]{1,60}$/;
const purpose=/^[a-z][a-z0-9-]{0,24}$/;
const kindValues=['personal','organization'];
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const base={dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}};
const props=(extra,required)=>({type:'object',properties:{...extra,...base},
 required,additionalProperties:false});
function owner(ctx){
 const org=ctx.connection?.neonOrg??ctx.connection?.neon_org;
 if(!ID.test(org??'')||ctx.connection.profile!=='full'||
    ctx.connection.projectScope||ctx.connection.project_scope)
  throw Error('Verified unscoped full-owner organization connection required');
 return org;
}
async function selected(ctx,kind){
 const org=owner(ctx),need=kind==='personal'?'personal':'org';
 const result=await projectClient(ctx,null,{need});
 if(result.scope?.org!==org||result.scope.scoped||
    (kind==='personal' && (result.credentialKind!=='personal'||!result.credentialOwnerUserId))||
    (kind==='organization' && !['personal','org'].includes(result.credentialKind)))
  throw Error('Verified administrator credential unavailable for this key scope');
 return {org,client:result.client};
}
async function providerInventory(ctx,kind){
 const {org,client}=await selected(ctx,kind);
 const result=await projectRead(client,kind==='personal'?'listApiKeys':'listOrgApiKeys',
  kind==='personal'?{}:{path:{org_id:org}});
 if(!Array.isArray(result)||result.length>1000||
    result.some(x=>!Number.isSafeInteger(x?.id)||x.id<1||typeof x.name!=='string'))
  throw Error('Provider API key inventory cannot be independently verified');
 if(new Set(result.map(x=>x.id)).size!==result.length)throw Error('Duplicate key IDs');
 return {org,client,rows:result};
}
async function localKeys(ctx,org){
 if(typeof ctx.db.listNeonKeySummaries!=='function')
  throw Error('Server key inventory unavailable');
 const rows=await ctx.db.listNeonKeySummaries(org);
 if(!Array.isArray(rows)||rows.length>2000)throw Error('Server key inventory incomplete');
 return rows.filter(x=>!x.revoked_at);
}
async function contextFor(ctx){
 owner(ctx);
 const trusted=await createProjectWriteContext(ctx,{keyNeed:'org'});
 const guard=trusted.guards;
 return {...trusted,guards:{
  checkProtected:async()=>true,
  checkApp:async()=>true,
  checkProduction:async()=>({allowed:true,production:false}),
  checkSpend:guard.checkSpend
 }};
}
const create=defineWrite({name:'neon_apikey_create',key:'org',access:true,secret:true,
 productionEffect:'none',
 plan:async(a,c)=>{
  const org=owner(c);
  if(!kindValues.includes(a.kind)||!purpose.test(a.purpose??''))
   throw Error('Choose a personal or organization key and a short safe purpose');
  if(a.projectId!==undefined && (a.kind!=='organization'||!ID.test(a.projectId)))
   throw Error('Project-restricted creation needs an organization key and valid project');
  if(a.storeAsServerKey!==undefined&&typeof a.storeAsServerKey!=='boolean')
   throw Error('Invalid secure storage option');
  // Both handoff and encryption must be usable before Neon creates an unrepeatable token.
  checkSecretStorage(c);
  const scope=a.kind==='personal'?'personal':a.projectId?'project':'org';
  if(a.storeAsServerKey===true){
   if(typeof c.db.getEncryptedNeonKey!=='function')
    throw Error('Encrypted key rotation is unavailable');
   const old=await c.db.getEncryptedNeonKey({orgId:org,kind:scope,
    projectId:a.projectId??null});
   if(old && typeof c.db.rotateEncryptedNeonKey!=='function')
    throw Error('Atomic server key rotation is unavailable');
  }
  if(a.projectId){
   const {client}=await selected(c,'organization');
   const p=(await projectRead(client,'getProject',{path:{project_id:a.projectId}}))?.project;
   if(p?.id!==a.projectId||p.org_id!==org)throw Error('Key target outside organization');
  }
  const keys=await providerInventory(c,a.kind);
  const name='robinson-neon-mcp-'+a.purpose+'-'+new Date().toISOString().slice(0,10);
  if(name.length>64)throw Error('Generated key name exceeds provider limit');
  return {target:'org:'+org+':create-key:'+a.kind+':'+name+':'+(a.projectId??'all'),
   before:{org,name,scope,projectId:a.projectId??null,count:keys.rows.length},
   summary:'Create '+a.kind+' API key '+name+' for '+org+
    (a.projectId?' limited to '+a.projectId:'')+
    (a.storeAsServerKey?' and atomically enroll it as this server credential':
     ' and release the token only through the owner-passphrase one-time page')+
    '. API keys grant ongoing access until revoked.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const inv=await providerInventory(c,a.kind);
  if(inv.rows.length!==before.count||inv.org!==before.org)
   throw Error('Key inventory changed since preview');
  const params=a.kind==='personal'?{body:{key_name:before.name}}:
   {path:{org_id:before.org},body:{key_name:before.name,
    ...(before.projectId?{project_id:before.projectId}:{})}};
  const reply=await call(inv.client,a.kind==='personal'?'createApiKey':'createOrgApiKey',
   params,{write:true,requestKey});
  if(reply.error)return {confirmed:reply.error.code==='unknown_outcome'?'pending':false};
  const created=reply.data?.api_key??reply.data;
  if(!Number.isSafeInteger(created?.id)||created.id<1||
     typeof created.key!=='string'||!created.key.startsWith('napi_'))
   return {confirmed:'pending'};
  const after=await providerInventory(c,a.kind);
  if(!after.rows.some(x=>x.id===created.id && x.name===before.name))
   return {confirmed:'pending'};
  if(a.storeAsServerKey===true){
   const vault=createKeyVault({db:c.db,env:c.env});
   const input={orgId:before.org,kind:before.scope,
    projectId:before.projectId,key:created.key,label:before.name,
    providerKeyId:created.id};
   await vault.storeOrRotateKey(input);
  }else{
   const oneTime=checkSecretStorage(c);
   const token=await oneTime.putOneTimeSecret({kind:'neon_api_key',
    label:before.name,org:before.org,secret:created.key});
   c.ownerKeyOneTime=token.link;
  }
  c.createdProviderKeyId=created.id;
  return {confirmed:true};
 },
 readAfter:async(a,c)=>providerInventory(c,a.kind),
 verify:(b,after,_a,c)=>after.org===b.org&&after.rows.some(x=>
  x.id===c.createdProviderKeyId&&x.name===b.name)
});
const revoke=defineWrite({name:'neon_apikey_revoke',key:'org',access:true,
 destructive:true,productionEffect:'none',
 plan:async(a,c)=>{
  if(!kindValues.includes(a.kind)||!Number.isSafeInteger(a.keyId)||a.keyId<1)
   throw Error('Exact provider key ID and key kind required');
  const inv=await providerInventory(c,a.kind);
  const key=inv.rows.find(x=>x.id===a.keyId);
  if(!key)throw Error('Provider key does not exist');
  const active=await localKeys(c,inv.org);
  if(active.some(x=>x.reach?.providerKeyId===a.keyId &&
       (a.kind==='personal'?x.kind==='personal':x.kind!=='personal')))
   throw Error('Cannot revoke an API key actively used by this server');
  if(key.name.startsWith('robinson-neon-mcp-')){
   if(!Number.isSafeInteger(a.replacementVaultId)||
     !active.some(x=>x.id===a.replacementVaultId&&
      x.reach?.verified===true&&
      x.reach?.providerKeyId!==a.keyId&&
      (a.kind==='personal'?x.kind==='personal':x.kind!=='personal')))
    throw Error('Verify and select a different active replacement server credential first');
  }
  return {target:'org:'+inv.org+':key:'+a.kind+':'+a.keyId,
   before:{org:inv.org,id:a.keyId,kind:a.kind,name:key.name,
    replacementVaultId:a.replacementVaultId??null},
   summary:'Permanently revoke '+a.kind+' API key '+a.keyId+' ('+key.name+
    ') for '+inv.org+'. All clients still using its token will lose access immediately.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const inv=await providerInventory(c,a.kind);
  if(inv.org!==before.org||inv.rows.find(x=>x.id===before.id)?.name!==before.name)
   throw Error('API key changed since approval');
  const active=await localKeys(c,inv.org);
  if(active.some(x=>x.reach?.providerKeyId===before.id))throw Error('Server uses key');
  if(before.name.startsWith('robinson-neon-mcp-')&&
   !active.some(x=>x.id===before.replacementVaultId&&
    x.reach?.verified===true&&x.reach?.providerKeyId!==before.id))
   throw Error('Replacement server key missing');
  const op=a.kind==='personal'?'revokeApiKey':'revokeOrgApiKey';
  const path=a.kind==='personal'?{key_id:before.id}:
   {org_id:before.org,key_id:before.id};
  const response=await call(inv.client,op,{path},{write:true,requestKey});
  return {confirmed:response.error?
   (response.error.code==='unknown_outcome'?'pending':false):true};
 },
 readAfter:async(a,c)=>providerInventory(c,a.kind),
 verify:(before,after)=>after.org===before.org&&!after.rows.some(x=>x.id===before.id)
});
const defs=[
 [create,{kind:{type:'string',enum:kindValues},
  purpose:{type:'string',pattern:'^[a-z][a-z0-9-]{0,24}$'},
  projectId:id,storeAsServerKey:{type:'boolean'}},['kind','purpose']],
 [revoke,{kind:{type:'string',enum:kindValues},
  keyId:{type:'integer',minimum:1},replacementVaultId:{type:'integer',minimum:1}},
  ['kind','keyId']]
];
export const tools=defs.map(([d,fields,required])=>({...d.tool,profiles:['full'],
 area:'owner',audience:['owner'],
 description:d===create?'Create a verified scoped Neon API key with one-time owner delivery or encrypted server rotation.':
  'Revoke one exact provider API key only after checking active server credentials and replacement.',
 secretRoute:d===create?'/api/neon/setup':undefined,oneTimeOnly:d===create,
 inputSchema:props(fields,required)}));
export const handlers=Object.fromEntries(defs.map(([d])=>[d.tool.name,
 async(a,ctx)=>{
  const trusted=await contextFor(ctx);
  const result=await d.handler(a,trusted);
  if(d===create&&trusted.ownerKeyOneTime){
   const body=JSON.parse(result.content[0].text);
   if(body.confirmed===true)
    result.content[0].text=JSON.stringify({...body,oneTimeSecretLink:trusted.ownerKeyOneTime});
  }
  return result;
 }]));
