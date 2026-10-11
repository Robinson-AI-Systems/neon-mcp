// The setup page is the ONLY place where an owner types or views secrets.
import { createDb } from '../../src/db.js';
import { createKeyVault } from '../../src/neon/keys.js';
import { createOneTimeSecrets } from '../../src/core/one-time.js';
import { evaluateLogin,clientIp,LOCKOUT_WINDOW_MINUTES } from '../../src/core/oauth.js';
import { publicOrigin,send,paramsOf,only,escapeHtml } from '../../src/core/http.js';
import { configuredSelfResource } from '../../src/core/self-resource.js';
import { mergeWithSelf,validateProtectedResources } from '../../src/core/protected-resources.js';

function page(message='',p={}) {
  const input=(name,type='text',value='')=>'<label>'+escapeHtml(name)+
    '<input name="'+name+'" type="'+type+'" value="'+escapeHtml(value)+'" required></label>';
  const password=()=>input('passphrase','password');
  const form=(action,fields)=>'<form method="post"><input type="hidden" name="action" value="'+action+'">'+
    fields+password()+'<button type="submit">'+escapeHtml(action.replaceAll('_',' '))+'</button></form>';
  const org=()=>input('orgId');
  const list=form('list_keys',org());
  const add=form('add_key',org()+input('orgLabel')+input('projectId')+input('key','password')+
    input('label')+'<input type="hidden" name="kind" value="project">');
  const revoke=form('revoke_key',org()+input('keyId','number'));
  const listProtected=form('list_protected_resources',org());
  const protectedEditor=form('save_protected_resources',org()+
    '<p>Enter a JSON list of other protected projects or branches. Your server project is always protected separately.</p>'+
    '<textarea name="resourcesJson" rows="6" required aria-label="Protected resources JSON">[]</textarea>');
  const outbound=form('view_once',org()+input('onceId','text',p.once||''));
  const inbound=form('submit_secret',org()+input('requestId','text',p.secret_request||'')+
    input('secret','password'));
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Neon MCP secure setup</title></head><body><main><h1>Neon MCP secure setup</h1>'+
    '<p>The owner passphrase is required for every operation. AI tools never accept keys.</p>'+
    (message?'<p role="status">'+escapeHtml(message)+'</p>':'')+
    '<h2>List keys</h2>'+list+'<h2>Add scoped key</h2>'+add+
    '<h2>Revoke a key</h2>'+revoke+
    '<h2>Protected resources (owner only)</h2>'+
    '<p>Your Neon MCP database cannot be removed from protection. Configure and verify its own project in Vercel first.</p>'+
    listProtected+protectedEditor+'<h2>View secret once</h2>'+outbound+
    '<h2>Supply requested secret</h2>'+inbound+'</main></body></html>';
}
export function createSetupHandler({db,vault,exchange,env=process.env}={}) {
  if(!db||!vault||!exchange)throw new TypeError('Setup dependencies are required');
  return async function setup(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if(!only(res,req,['GET','POST']))return;
    let origin;
    try {origin=publicOrigin(env);} catch{return send(res,503,{error:'server_not_configured'});}
    if(req.method==='GET')return send(res,200,page('',req.query||{}),'text/html; charset=utf-8');
    if(req.headers?.origin!==origin)return send(res,403,{error:'invalid_origin'});
    if(!env.ADMIN_PASSPHRASE)return send(res,503,{error:'server_not_configured'});
    let p;
    try{p=paramsOf(req);}catch{return send(res,400,{error:'invalid_request'});}
    const result=await evaluateLogin({ip:clientIp(req),supplied:p.passphrase,
      expected:env.ADMIN_PASSPHRASE,store:db});
    if(result.status==='locked'){
      res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
      return send(res,429,page('Too many sign-in attempts. Try later.'),'text/html; charset=utf-8');
    }
    if(result.status!=='ok')return send(res,401,page('Incorrect passphrase.'),'text/html; charset=utf-8');
    const orgId=typeof p.orgId==='string'?p.orgId.trim():'';
    if(!orgId||orgId.length>120)return send(res,400,{error:'invalid_organization'});
    try{
      if(p.action==='list_keys'){
        const rows=await vault.listKeys(orgId);
        const safe=rows.map(({id,kind,project_id,last4,label,revoked_at})=>
          ({id,kind,project_id,last4,label,revoked:!!revoked_at}));
        return send(res,200,page(JSON.stringify(safe)),'text/html; charset=utf-8');
      }
      if(p.action==='add_key'){
        if(p.kind!=='project'||!p.projectId)return send(res,400,{error:'project_scope_required'});
        const added=await vault.storeKey({orgId,orgLabel:p.orgLabel,projectId:p.projectId,
          kind:'project',key:p.key,label:p.label});
        return send(res,200,page('Scoped key stored for '+added.projectId+'; last four '+added.last4),
          'text/html; charset=utf-8');
      }
      if(p.action==='revoke_key'){
        if(!/^\d+$/.test(String(p.keyId))||!Number.isSafeInteger(Number(p.keyId)))
          return send(res,400,{error:'invalid_key_id'});
        const ok=await vault.revokeKey({orgId,id:Number(p.keyId)});
        return send(res,200,page(ok?'Key revoked.':'No active scoped key matched.'),
          'text/html; charset=utf-8');
      }
      if(p.action==='list_protected_resources'){
        const configured=configuredSelfResource(env);
        if(configured.org!==orgId)return send(res,403,{error:'self_organization_mismatch'});
        const entries=mergeWithSelf(await db.getProtectedResources(),configured);
        return send(res,200,page(JSON.stringify(entries)),'text/html; charset=utf-8');
      }
      if(p.action==='save_protected_resources'){
        const configured=configuredSelfResource(env);
        if(configured.org!==orgId)return send(res,403,{error:'self_organization_mismatch'});
        if(typeof p.resourcesJson!=='string'||p.resourcesJson.length>16000)
          return send(res,400,{error:'invalid_resources'});
        let parsed;
        try {parsed=JSON.parse(p.resourcesJson);}catch{
          return send(res,400,{error:'invalid_resources'});
        }
        const entries=mergeWithSelf(validateProtectedResources(parsed),configured);
        await db.saveProtectedResourcesFromSetup(entries.filter(x=>x.kind!=='self'));
        return send(res,200,page('Protected resources saved; your Neon MCP database remains protected.'),
          'text/html; charset=utf-8');
      }
      if(p.action==='view_once'){
        const viewed=await exchange.takeOneTimeSecret({id:p.onceId,org:orgId});
        return send(res,viewed?200:404,page(viewed?'Secret shown once: '+viewed.secret:
          'Secret unavailable, expired, or already viewed.'),'text/html; charset=utf-8');
      }
      if(p.action==='submit_secret'){
        const ok=await exchange.submitRequestedSecret({id:p.requestId,org:orgId,secret:p.secret});
        return send(res,ok?200:404,page(ok?'Secret submitted securely.':
          'Request unavailable or already completed.'),'text/html; charset=utf-8');
      }
      return send(res,400,{error:'unsupported_action'});
    }catch{
      return send(res,400,page('Action unsuccessful. Check your organization, key and setup settings.'),
        'text/html; charset=utf-8');
    }
  };
}
export default async function handler(req,res){
  try{
    const db=createDb();
    await db.initSchema();
    return await createSetupHandler({db,vault:createKeyVault({db}),exchange:createOneTimeSecrets({db})})(req,res);
  }catch{
    return send(res,503,{error:'temporarily_unavailable'});
  }
}
