// Public instructions only. OAuth consent and protected secret fields remain on
// authenticated service-owned pages, never this information surface.
import {publicOrigin,escapeHtml,send} from '../src/core/http.js';
import {serverRelease} from '../src/core/server-release.js';
import {PRODUCT_DISPLAY_NAME,PRODUCT_ATTRIBUTION} from '../src/core/product-identity.js';
export function createConnectionPage({env=process.env}={}){
 return (req,res)=>{
  if(req.method!=='GET'){
   res.setHeader('Allow','GET');return send(res,405,{error:'method_not_allowed'});
  }
  let origin;
  try{origin=publicOrigin(env);}
  catch{return send(res,503,{error:'service_unconfigured'});}
  const release=serverRelease(env);
  const esc=value=>escapeHtml(value);
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width, initial-scale=1"><title>My connection · '+
   esc(PRODUCT_DISPLAY_NAME)+'</title><style>body{background:#151719;color:#f2f4f5;'+
   'font:16px system-ui,sans-serif;line-height:1.6;margin:0}main{max-width:740px;'+
   'padding:48px 24px;margin:auto}a{color:#ff9393}code{overflow-wrap:anywhere}'+
   'aside{border-left:3px solid #ff5f5f;padding-left:16px;color:#d0d6da}</style></head><body><main>'+
   '<p><a href="/">Service home</a></p><h1>My connection</h1><p>'+esc(PRODUCT_ATTRIBUTION)+'</p>'+
   '<p>This service supports direct Streamable HTTP MCP with its own OAuth. '+
   'Connect only through clients that support remote Streamable HTTP and this service’s OAuth flow; '+
   'individual mobile/desktop client compatibility has not yet been independently certified.</p>'+
   '<h2>Remote MCP endpoint</h2><p><code>'+esc(origin+'/api/mcp')+'</code></p>'+
   '<p>OAuth metadata: <a href="/.well-known/oauth-authorization-server">Authorization server</a> · '+
   '<a href="/.well-known/oauth-protected-resource">Protected resource</a></p>'+
   '<p>Mobile clients using the encrypted code handoff may register the exact callback '+
   '<code>'+esc(origin+'/api/connect/handoff')+'</code>. Already registered older clients '+
   'may continue to use their existing callback until independently migrated; this is a normal '+
   'customer consent flow, not an internal developer login.</p>'+
   '<h2>Security and disconnect</h2><p>Authorize your own organization and requested rights '+
   'on the normal OAuth consent page. Never paste provider keys, passwords, access tokens '+
   'or pass contents into chat. The client may revoke its token at <code>'+
   esc(origin+'/api/oauth/revoke')+'</code> where supported; '+
   'you can also revoke connection access through your authenticated account settings.</p>'+
   '<aside>RTC HTTPS passes are a separate credential family from native MCP OAuth. '+
   'Public distribution and production access are not yet approved; verify your specific client '+
   'and tenant before relying on a connection.</aside>'+
   '<p>Connected server version: '+esc(release.version)+
   '. <a href="'+esc(release.release_notes_url)+'" rel="noopener noreferrer">Released branch history</a>.</p>'+
   '</main></body></html>';
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy','no-referrer');
  return send(res,200,html,'text/html; charset=utf-8');
 };
}
export default createConnectionPage();
