import { createHash } from 'node:crypto';
// The setup page is the ONLY place where an owner types or views secrets.
import { createDb } from '../../src/db.js';
import { createKeyVault,keySetupMessage } from '../../src/neon/keys.js';
import { createOneTimeSecrets } from '../../src/core/one-time.js';
import { evaluateLogin,clientIp,LOCKOUT_WINDOW_MINUTES } from '../../src/core/oauth.js';
import { publicOrigin,send,paramsOf,only,escapeHtml } from '../../src/core/http.js';
import { configuredSelfResource } from '../../src/core/self-resource.js';
import { mergeWithSelf,validateProtectedResources } from '../../src/core/protected-resources.js';
import { activationEligible } from '../../src/core/owner-activation.js';
import { issueReadOnlyRtcPass } from '../../src/core/rtc-passes.js';
import {attestIsolatedScratch,revokeIsolatedScratch,SCRATCH_PHRASE} from '../../src/neon/scratch-ownership.js';

const styles=`
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: Canvas; color: CanvasText; line-height: 1.5; }
    main { max-width: 46rem; margin: 0 auto; padding: 1.5rem; }
    h1 { line-height: 1.2; } h2 { margin-top: 2rem; }
    form { display: grid; gap: 1.25rem; padding: 1.25rem; border: 1px solid GrayText; border-radius: .75rem; }
    .field { display: grid; gap: .35rem; min-width: 0; }
    .field span { font-weight: 650; } small { font-size: .9rem; }
    input:not([type=hidden]), textarea { display: block; width: 100%; min-width: 0;
      padding: .75rem; font: inherit; border: 1px solid GrayText; border-radius: .35rem;
      background: Field; color: FieldText; }
    textarea { resize: vertical; } button { min-height: 2.75rem; padding: .65rem 1rem;
      font: inherit; font-weight: 650; cursor: pointer; }
    :focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
    [role=status] { padding: 1rem; border: 2px solid Highlight; overflow-wrap: anywhere; }
    @media (max-width: 480px) { main { padding: 1rem; } form { padding: 1rem; } }
  `;
const styleHash=createHash('sha256').update(styles).digest('base64');

function page(message='',p={}) {
  const fields={
    orgId:['Organization ID','Copy the organization ID from Neon organization settings.'],
    orgLabel:['Organization name','A recognizable name for this organization, such as its account email.'],
    projectId:['Project ID','Copy the ID of the single Neon project this key can access.'],
    key:['Neon API key','Paste the project-scoped API key copied from Neon.'],
    label:['Key name','Use the same descriptive name you gave this key in Neon.'],
    passphrase:['Administrator passphrase','Enter your Neon MCP administrator passphrase, configured in Vercel as ADMIN_PASSPHRASE.'],
    keyId:['Stored key ID','Use the numeric ID returned by List keys.'],
    approvalPhrase:['Production approval phrase','Only enter the approval phrase after completing the required owner checks.'],
    onceId:['One-time secret ID','Use the ID from your one-time secret link.'],
    requestId:['Secret request ID','Use the ID of the pending secret request.'],
    secret:['Requested secret','Paste the secret requested by this operation.'],
    ttlHours:['Pass lifetime in hours','The read-only pass expires after this many hours.'],
    passId:['Read-only pass ID','Use the ID of the pass you want to revoke.'],
    scratchPhrase:['Scratch isolation acknowledgement','Type the complete isolated-project acknowledgement; this is a separate ownership attestation, not production approval.']
  };
  const input=(name,type='text',value='')=>{
    const [title,help]=fields[name]||[name,''];
    return '<label class="field"><span>'+escapeHtml(title)+'</span><small>'+escapeHtml(help)+
      '</small><input name="'+name+'" type="'+type+'" value="'+escapeHtml(value)+
      '" autocomplete="'+(name==='passphrase'?'current-password':'off')+'" required></label>';
  };
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
  const certifyScratch=form('attest_scratch_project',org()+input('projectId')+input('scratchPhrase'));
  const revokeScratch=form('revoke_scratch_attestation',org()+input('projectId'));
  const listScratch=form('list_scratch_attestations',org());
  const approve=form('approve_production',org()+input('approvalPhrase'));
  const disable=form('disable_production',org());
  const outbound=form('view_once',org()+input('onceId','text',p.once||''));
  const inbound=form('submit_secret',org()+input('requestId','text',p.secret_request||'')+
    input('secret','password'));
  const issueRtc=form('create_read_only_rtc_pass',org()+input('projectId')+
    input('ttlHours','number','24'));
  const revokeRtc=form('revoke_read_only_rtc_pass',org()+input('passId'));
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Neon MCP secure setup</title><style>'+styles+'</style></head><body><main><h1>Neon MCP secure setup</h1>'+
    '<p>The owner passphrase is required for every operation. AI tools never accept keys.</p>'+
    (message?'<p role="status">'+escapeHtml(message)+'</p>':'')+
    '<h2>List keys</h2>'+list+'<h2>Add scoped key</h2>'+
    '<p>Save one project-scoped key at a time. Fill the fields below from top to bottom, then select add key. '+
    'This connects Neon MCP to that project; it does not change the application’s database connection.</p>'+add+
    '<h2>Revoke a key</h2>'+revoke+
    '<h2>Protected resources (owner only)</h2>'+
    '<p>Your Neon MCP database cannot be removed from protection. Configure and verify its own project in Vercel first.</p>'+
    listProtected+protectedEditor+
    '<h2>Isolated scratch classification (owner certification)</h2>'+
    '<p>Only for an independently enrolled test project with NO external application, consumer, preview or production dependencies. Confirm after reviewing the project and exact key in Neon. This classification permits the ordinary B-1 app-ownership check but does not bypass protected, production, spending, confirmation or audit gates. It may be revoked here at any time. Type <strong>'+escapeHtml(SCRATCH_PHRASE)+'</strong> exactly. Never attest a real app project.</p>'+
    certifyScratch+revokeScratch+listScratch+
    '<h2>Production access (OWNER ONLY)</h2>'+
    '<p>OFF until owner-approved X-2/X-3 checks and protected-list confirmation. An agent request alone NEVER enables writes. To approve a pending request from the last 10 minutes, type ENABLE_PRODUCTION in the approval field and enter your passphrase.</p>'+
    approve+disable+
    '<h2>Temporary read-only Toolkit Hub pass (owner only)</h2>'+
    '<p>Scoped to one independently verified project key. Preview only, up to 24 hours, 60 calls/minute, no writes or production reads. Displayed only on the one-time owner page. RTC must be enabled by reviewed deployment configuration.</p>'+
    issueRtc+revokeRtc+'<h2>View secret once</h2>'+outbound+
    '<h2>Supply requested secret</h2>'+inbound+'</main></body></html>';
}
export function createSetupHandler({db,vault,exchange,env=process.env,scratchClientFor}={}) {
  if(!db||!vault||!exchange)throw new TypeError('Setup dependencies are required');
  return async function setup(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    // Preserve the Origin of HTTPS form POSTs without disclosing paths or query secrets.
    res.setHeader('Referrer-Policy','strict-origin');
    res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'sha256-${styleHash}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
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
      if(p.action==='create_read_only_rtc_pass'){
        if(env.RTC1_ENABLED!=='1')return send(res,403,{error:'rtc_not_enabled'});
        if(typeof p.projectId!=='string'||!/^[a-z0-9-]{1,60}$/.test(p.projectId)||
          !/^([1-9]|1\\d|2[0-4])$/.test(String(p.ttlHours)))
          return send(res,400,{error:'invalid_read_only_pass_scope'});
        const receipt=await issueReadOnlyRtcPass({db,exchange,env,orgId,
          projectScope:p.projectId,ttlHours:Number(p.ttlHours)});
        // Only the one-time link, never the pass value, enters rendered HTML.
        return send(res,200,page('Temporary read_only pass '+receipt.passId+
          ' created. View once via '+receipt.oneTimeLink+
          '. Expires '+receipt.expiresAt),'text/html; charset=utf-8');
      }
      if(p.action==='revoke_read_only_rtc_pass'){
        const ok=await db.revokeRtcPass({orgId,passId:p.passId});
        return send(res,ok?200:404,page(ok?'Temporary RTC pass revoked.':
          'No active pass matched that organization and identifier.'),
          'text/html; charset=utf-8');
      }
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
      if(p.action==='attest_scratch_project'){
        const receipt=await attestIsolatedScratch({db,vault,env,orgId,
          projectId:p.projectId,phrase:p.scratchPhrase,clientFor:scratchClientFor});
        return send(res,200,page('Owner-certified isolated scratch project '+receipt.projectId+
          '. B-1 protected, production, spending, audit and write confirmations remain active.'),
          'text/html; charset=utf-8');
      }
      if(p.action==='revoke_scratch_attestation'){
        const ok=await revokeIsolatedScratch({db,orgId,projectId:p.projectId});
        return send(res,ok?200:404,page(ok?'Scratch certification revoked; app ownership is unknown and writes refuse.':
          'No active scratch attestation matched that scope.'),'text/html; charset=utf-8');
      }
      if(p.action==='list_scratch_attestations'){
        if(typeof db.listScratchAttestations!=='function')
          return send(res,503,{error:'scratch_evidence_unavailable'});
        const rows=await db.listScratchAttestations(orgId);
        return send(res,200,page(JSON.stringify(rows)),'text/html; charset=utf-8');
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
      if(p.action==='approve_production'){
        if(p.approvalPhrase!=='ENABLE_PRODUCTION')
          return send(res,400,{error:'explicit_approval_required'});
        if(!await activationEligible({env,db,orgId}))
          return send(res,403,{error:'production_gate_not_approved'});
        const ok=await db.completeProductionEnable({orgId});
        return send(res,ok?200:409,page(ok?'Owner approved production access for this organization.':
          'No pending request valid in the last ten minutes.'),'text/html; charset=utf-8');
      }
      if(p.action==='disable_production'){
        if(env.VERCEL_ENV!=='production')return send(res,403,{error:'preview_cannot_change_production'});
        const ok=await db.disableProduction({orgId});
        return send(res,ok?200:404,page(ok?'Production access disabled and pending request canceled.':
          'Organization unavailable.'),'text/html; charset=utf-8');
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
    }catch(error){
      return send(res,400,page(keySetupMessage(error)||'Action unsuccessful. Check your organization, key and setup settings.'),
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
