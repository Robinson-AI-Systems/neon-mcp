import {escapeHtml,send} from '../src/core/http.js';
import {serviceHealth} from '../src/service-health.js';
import {PRODUCT_DISPLAY_NAME,PRODUCT_ATTRIBUTION} from '../src/core/product-identity.js';
import {serverRelease} from '../src/core/server-release.js';

export function createFrontDoor({env=process.env,health=serviceHealth}={}){
  return async(req,res)=>{
    if(req.method!=='GET'){
      res.setHeader('Allow','GET');
      return send(res,405,{error:'method_not_allowed'});
    }
    const state=await health({env});
    const rel=serverRelease(env);
    const safe=x=>escapeHtml(x);
    const commit=rel.commit?'<a href="'+safe(rel.source)+'" rel="noopener noreferrer">'+
      safe(rel.commit.slice(0,12))+'</a>':'Unavailable (not verified)';
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy','no-referrer');
    const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title>'+safe(PRODUCT_DISPLAY_NAME)+'</title>'+
      '<style>body{background:#151719;color:#f2f4f5;font:16px system-ui,sans-serif;line-height:1.6;margin:0}main{max-width:720px;padding:64px 24px;margin:auto}h1{font-size:2.4rem;margin-bottom:0}a{color:#ff9393}small{color:#b7c1c5}.mark{color:#ff5f5f}.status{padding:8px 0;font-weight:650}code{overflow-wrap:anywhere}footer{margin-top:36px;border-top:1px solid #45484a;padding-top:24px}</style>'+
      '</head><body><main><small class="mark">ROBINSON AI SYSTEMS · INDEPENDENT INTEGRATION</small>'+
      '<h1>'+safe(PRODUCT_DISPLAY_NAME)+'</h1><p>'+safe(PRODUCT_ATTRIBUTION)+'</p>'+
      '<p class="status">Service health: '+safe(state.status)+' · '+safe(state.tools)+' registered tools</p>'+
      '<p>Capability census (2026-11-04): 73 of 152 platform operations covered, 4 composed, the rest missing with filed plans; this server’s own lifecycle records are complete. Full record: row 15 of docs/COMPLETION.md in the public repository.</p>'+
      '<p>Version: <code>'+safe(rel.version)+'</code> · Deployed revision: '+commit+'</p>'+
      '<p>Development-stage service. A status page is not proof of an authenticated Neon account connection.</p>'+
      '<p><a href="/api/health">Health</a> · <a href="/connection">My connection</a> · <a href="/api/contract">Contract</a> · '+
      '<a href="/.well-known/oauth-authorization-server">OAuth discovery</a> · '+
      '<a href="/api/mcp">MCP endpoint</a></p><footer><small>Technical identifier: robinson-neon-mcp. '+
      'No affiliation with or endorsement by Neon. Public enrollment and production permissions are separately controlled.</small></footer></main></body></html>';
    return send(res,200,html,'text/html; charset=utf-8');
  };
}
export default createFrontDoor();
