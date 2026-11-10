import {escapeHtml,send} from '../src/core/http.js';
import {serviceHealth} from '../src/service-health.js';
import {PRODUCT_DISPLAY_NAME,PRODUCT_ATTRIBUTION} from '../src/core/product-identity.js';
import {serverRelease} from '../src/core/server-release.js';

// The public address comes only from PUBLIC_BASE_URL (never the request's Host).
function publicAddress(env){
  try{const u=new URL(env.PUBLIC_BASE_URL);
    if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)return u.origin+'/api/mcp';}catch{}
  return 'https://neon.robinsonaisystems.com/api/mcp';
}

// Owner request 2026-11-10: the same home page every Unleashed server has:
// what it does, how connecting works, then steps for every major app, checked
// against each app's current docs (Claude support.claude.com custom connectors;
// ChatGPT Plugins > + > Add custom MCP server; Claude Code code.claude.com/docs/en/mcp;
// Codex developers.openai.com/codex/mcp; Cursor cursor.com/docs/mcp; VS Code
// code.visualstudio.com/docs/copilot/reference/mcp-configuration; Gemini CLI
// gemini mcp add --transport http + /mcp auth; Windsurf mcp_config.json serverUrl).
// Honest about who can connect: today the sign-in page asks for the service
// owner's administrator passphrase, so only the owner can finish it.
function connectSteps(address){
  const A=escapeHtml(address),N='neon-unleashed';
  return '<section id="start"><h2>How connecting works</h2>'+
    '<p class="note"><b>Who can connect right now:</b> only the owner of this service. Its sign-in page asks for the '+
    'administrator passphrase, then your Neon organization, project scope and access level. Public sign-up is not open yet.</p>'+
    '<ol><li><a href="#connect">Add the address below</a> to your AI app.</li>'+
    '<li>Your app opens this service’s own sign-in page. Choose the Neon organization and how much the app may do, '+
    'enter the administrator passphrase, and approve.</li>'+
    '<li>Then ask your assistant for what you need. Never paste Neon keys or passwords into a chat.</li></ol>'+
    '<p><small><a href="/connection">My connection</a> has the technical details and how to disconnect.</small></p></section>'+
    '<section id="connect"><h2>Connect your AI app</h2><p>Your connector address:</p><code class="addr">'+A+'</code>'+
    '<p><small>Leave any Client ID and Client Secret boxes blank (Muse is the one exception, below).</small></p>'+
    '<h3>Claude (web, desktop and phone)</h3><ol><li>Open <b>Settings</b> (called <b>Customize</b> in some versions), then <b>Connectors</b>. '+
    'On a phone, open <a href="https://claude.ai/settings/connectors">claude.ai/settings/connectors</a> in your browser.</li>'+
    '<li>Choose <b>+</b> or <b>Add</b>, then <b>Add custom connector</b>. Give it a name and paste the address.</li>'+
    '<li>Choose <b>Add</b>, then <b>Connect</b>, and finish on the sign-in page.</li></ol>'+
    '<h3>ChatGPT</h3><ol><li>On chatgpt.com, open <b>Plugins</b>, choose the <b>+</b> button, then <b>Add custom MCP server</b>.</li>'+
    '<li>Paste the address, choose <b>OAuth</b>, then <b>Create</b> and install it, and finish on the sign-in page.</li></ol>'+
    '<p><small>Needs a paid ChatGPT plan. If you do not see that option, turn on Developer mode under Settings, Apps &amp; Connectors, Advanced.</small></p>'+
    // D-006 MC-8: the one Muse sentence every fleet server uses.
    '<h3>Muse</h3><p>Open <b>Settings</b>, then <b>Connectors</b>, then <b>Add custom connector</b>, and paste the address. '+
    'If Muse asks for a Client ID, type <code>muse</code> (the same for everyone, and nothing secret). <b>Client Secret: leave blank.</b></p>'+
    '<h3>Claude Code</h3><pre>claude mcp add --transport http '+N+' '+A+'</pre><p><small>Then type <code>/mcp</code> inside Claude Code and sign in.</small></p>'+
    '<h3>OpenAI Codex (and the ChatGPT desktop app)</h3><pre>codex mcp add '+N+' --url '+A+'\ncodex mcp login '+N+'</pre>'+
    '<p><small>In the desktop app instead: Settings, MCP servers, Add server, choose Streamable HTTP, paste the address, save, then Authenticate.</small></p>'+
    '<h3>Cursor</h3><p>Cursor Settings, MCP, New MCP Server, then add:</p><pre>{"mcpServers":{"'+N+'":{"url":"'+A+'"}}}</pre>'+
    '<p><small>Save, then choose Connect next to it and sign in.</small></p>'+
    '<h3>VS Code (GitHub Copilot)</h3><p>Command Palette (Ctrl+Shift+P, or Cmd+Shift+P on a Mac), run <b>MCP: Add Server</b>, '+
    'choose <b>HTTP</b>, paste the address and name it <code>'+N+'</code>. Sign in when VS Code asks.</p>'+
    '<h3>Gemini CLI</h3><pre>gemini mcp add --transport http --scope user '+N+' '+A+'</pre>'+
    '<p><small>Then start <code>gemini</code> and type <code>/mcp auth '+N+'</code>.</small></p>'+
    '<h3>Windsurf</h3><p>Windsurf Settings, Cascade, MCP servers, View raw config, then add:</p><pre>{"mcpServers":{"'+N+'":{"serverUrl":"'+A+'"}}}</pre>'+
    '<h3>Any other app</h3><p>Any app that can add a remote MCP server with sign-in (OAuth) works: paste the address and finish on the sign-in page.</p></section>';
}

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
      '<style>body{background:#151719;color:#f2f4f5;font:16px system-ui,sans-serif;line-height:1.6;margin:0}main{max-width:720px;padding:48px 20px;margin:auto}h1{font-size:2.2rem;margin-bottom:0;line-height:1.2}h2{margin-top:32px}h3{margin:22px 0 6px}a{color:#ff9393}small{color:#b7c1c5}.mark{color:#ff5f5f}.status{padding:8px 0;font-weight:650}code{overflow-wrap:anywhere}'+
      '.addr{display:block;background:#1f2224;border:1px solid #ff5f5f;border-radius:12px;padding:14px;margin:10px 0 16px;font:600 15px/1.4 ui-monospace,Menlo,Consolas,monospace;word-break:break-all;user-select:all}'+
      'pre{background:#1f2224;border:1px solid #45484a;border-radius:10px;padding:12px;white-space:pre-wrap;word-break:break-all;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace}'+
      '.note{border-left:3px solid #ff5f5f;padding-left:14px}section{border-top:1px solid #45484a;margin-top:28px}footer{margin-top:36px;border-top:1px solid #45484a;padding-top:24px}</style>'+
      '</head><body><main><small class="mark">ROBINSON AI SYSTEMS · INDEPENDENT INTEGRATION</small>'+
      '<h1>'+safe(PRODUCT_DISPLAY_NAME)+'</h1>'+
      '<p>Let your AI assistant work with your Neon databases: projects, branches, databases, roles, queries and more. '+
      'Changes are previewed first, and you choose how much each app may do.</p>'+
      '<p><small>'+safe(PRODUCT_ATTRIBUTION)+'</small></p>'+
      connectSteps(publicAddress(env))+
      '<section><h2>Service facts</h2>'+
      '<p class="status">Service health: '+safe(state.status)+' · '+safe(state.tools)+' registered tools</p>'+
      '<p>Capability census (2026-11-04): 73 of 152 platform operations covered, 4 composed, the rest missing with filed plans; this server’s own lifecycle records are complete. Full record: row 15 of docs/COMPLETION.md in the public repository.</p>'+
      '<p>Version: <code>'+safe(rel.version)+'</code> · Deployed revision: '+commit+'</p>'+
      '<p>Development-stage service. A status page is not proof of an authenticated Neon account connection.</p>'+
      '<p><a href="/api/health">Health</a> · <a href="/connection">My connection</a> · <a href="/api/contract">Contract</a> · '+
      '<a href="/.well-known/oauth-authorization-server">OAuth discovery</a> · '+
      '<a href="/api/mcp">MCP endpoint</a></p></section><footer><small>Technical identifier: robinson-neon-mcp. '+
      'No affiliation with or endorsement by Neon. Public enrollment and production permissions are separately controlled.</small></footer></main></body></html>';
    return send(res,200,html,'text/html; charset=utf-8');
  };
}
export default createFrontDoor();
