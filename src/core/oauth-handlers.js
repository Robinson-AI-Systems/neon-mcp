import {createOAuthRevocation} from './oauth-revocation.js';
// Copied and adapted from Robinson-AI-Systems/stripe-mcp src/core/oauth-handlers.js @ e2f90e8
// Contract-generic OAuth HTTP handlers. No Neon-specific imports.
import { randomToken, hashToken, secretsMatch, verifyPkce, validRedirectUri, evaluateLogin, clientIp, LOCKOUT_WINDOW_MINUTES } from './oauth.js';
import { publicOrigin, send, escapeHtml, paramsOf, only } from './http.js';
import { PRODUCT_DISPLAY_NAME, PRODUCT_ATTRIBUTION } from './product-identity.js';

const PROFILES = ['read_only', 'everyday', 'full'];
const LISTINGS = ['catalog', 'compact'];
const MODES = ['preview', 'production']; // Production is disabled until the organization gate is explicitly enabled.
const tokenResponse = (access, refresh) => ({
  access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh
});
const bad = (res, status, code, description) => send(res, status, { error: code, error_description: description });
const str = (x) => typeof x === 'string' ? x : '';

export function createOAuthHandlers({ db, env = process.env }) {
  function urls() {
    const origin = publicOrigin(env);
    return { origin, resource: origin + '/api/mcp' };
  }
  function validateResource(value) {
    const { resource } = urls();
    return value === resource;
  }
  async function register(req, res) {
    if (!only(res, req, ['POST'])) return;
    let p;
    try { p = paramsOf(req); } catch { return bad(res, 400, 'invalid_client_metadata', 'Malformed registration'); }
    if (!Array.isArray(p.redirect_uris) || p.redirect_uris.length < 1 || p.redirect_uris.length > 8 ||
      !p.redirect_uris.every(x => typeof x === 'string' && validRedirectUri(x)) ||
      new Set(p.redirect_uris).size !== p.redirect_uris.length) {
      return bad(res, 400, 'invalid_client_metadata', 'One to eight valid, distinct redirect URIs required');
    }
    const method = p.token_endpoint_auth_method === undefined ? 'client_secret_post' : p.token_endpoint_auth_method;
    if (!['client_secret_post','none'].includes(method)) {
      return bad(res, 400, 'invalid_client_metadata', 'Supported authentication: client_secret_post or none with S256 PKCE');
    }
    const id = randomToken(24), secret = method === 'none' ? null : randomToken(32);
    await db.createOAuthClient({ clientId: id, clientSecret: secret, redirectUris: p.redirect_uris,
      clientName: str(p.client_name).slice(0,100), tokenEndpointAuthMethod: method });
    return send(res, 201, { client_id: id,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      redirect_uris: p.redirect_uris, token_endpoint_auth_method: method,
      grant_types: ['authorization_code','refresh_token'], response_types: ['code'] });
  }
  function authorizePage(p, orgs, error = '', scopes = []) {
    const fields = ['client_id','redirect_uri','response_type','code_challenge','code_challenge_method','state','resource'];
    const hidden = fields.map(name => '<input type="hidden" name="' + name + '" value="' + escapeHtml(p[name]) + '">').join('');
    const orgList = orgs.map(org => '<option value="' + escapeHtml(org.id) + '"' +
      (p.neon_org === org.id ? ' selected' : '') + '>' + escapeHtml(org.label) + '</option>').join('');
    const defaultListing = p.default_listing || 'compact';
    const profileList = PROFILES.map(value => '<option value="' + value + '"' +
      ((p.profile || 'everyday') === value ? ' selected' : '') + '>' + value + '</option>').join('');
    const listingList = LISTINGS.map(value => '<option value="' + value + '"' +
      ((p.listing || defaultListing) === value ? ' selected' : '') + '>' + value + '</option>').join('');
    const selected = orgs.find(org => org.id === (p.neon_org || orgs[0]?.id));
    const canProduction = env.VERCEL_ENV === 'production' && selected?.production_enabled === true;
    const modeList = '<option value="preview">Preview — production changes disabled</option>' +
      (canProduction ? '<option value="production"' + (p.mode === 'production' ? ' selected' : '') + '>Production access enabled</option>' : '');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Connect ' + escapeHtml(PRODUCT_DISPLAY_NAME) + '</title><style>body{font:16px system-ui,sans-serif;max-width:460px;margin:6vh auto;padding:20px}form{display:grid;gap:14px}input,select,button{font:inherit;padding:10px}button{cursor:pointer}p{line-height:1.5}</style></head><body>' +
      '<h1>Connect ' + escapeHtml(PRODUCT_DISPLAY_NAME) + '</h1><p>' + escapeHtml(PRODUCT_ATTRIBUTION) + '</p>' + (error ? '<p role="alert">' + escapeHtml(error) + '</p>' : '') +
      (orgs.length ? '<p>Choose the Neon organization and access level for this AI connection.</p>' :
        '<p>Add a Neon key on the setup page first. You cannot authorize an agent until an organization is configured.</p>') +
      (!env.ADMIN_PASSPHRASE ? '<p>Administrator passphrase has not been configured.</p>' : '') +
      '<form method="post">' + hidden +
      '<label>Neon organization<select name="neon_org" required>' + orgList + '</select></label>' +
      '<label>Project scope<select name="project_scope"><option value="">All projects (within the key’s access)</option>' +
      scopes.map(id => '<option value="' + escapeHtml(id) + '"' +
        (p.project_scope === id ? ' selected' : '') + '>' + escapeHtml(id) + '</option>').join('') +
      '</select></label>' +
      '<label>Mode<select name="mode">' + modeList + '</select></label>' +
      '<label>Profile<select name="profile">' + profileList + '</select></label>' +
      '<label>Tool listing<select name="listing">' + listingList + '</select></label>' +
      '<label>Administrator passphrase<input type="password" name="passphrase" required autocomplete="current-password"></label>' +
      '<button type="submit"' + (!orgs.length || !env.ADMIN_PASSPHRASE ? ' disabled' : '') + '>Authorize this connection</button></form></body></html>';
  }
  async function authorize(req, res) {
    if (!only(res, req, ['GET', 'POST'])) return;
    let p;
    try { p = paramsOf(req); } catch { return bad(res, 400, 'invalid_request', 'Malformed authorization request'); }
    const client = await db.getOAuthClient(str(p.client_id));
    if (!client || !client.redirect_uris?.includes(p.redirect_uri) || !validRedirectUri(p.redirect_uri)) {
      return bad(res, 400, 'invalid_request', 'Unknown client or redirect address');
    }
    if (p.response_type !== 'code' || p.code_challenge_method !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(str(p.code_challenge)) || !validateResource(p.resource)) {
      return bad(res, 400, 'invalid_request', 'Authorization code, S256 PKCE, and exact MCP resource are required');
    }
    const orgs = await db.listNeonOrgs();
    const selectedOrgId = p.neon_org || orgs[0]?.id || '';
    const summaries = await db.listNeonKeySummaries(selectedOrgId);
    const scopes = summaries.filter(item => item.kind === 'project' &&
      !item.revoked_at && item.reach?.verified === true).map(item => item.project_id);
    const default_listing=/claude|anthropic/i.test(client.client_name||'')?'catalog':'compact';
    p={...p,default_listing};
    if (req.method === 'GET') return send(res, 200, authorizePage(p, orgs, '', scopes), 'text/html; charset=utf-8');
    if (!env.ADMIN_PASSPHRASE) return bad(res, 503, 'server_not_configured', 'Admin passphrase is not configured');
    const verdict = await evaluateLogin({ ip: clientIp(req), supplied: p.passphrase,
      expected: env.ADMIN_PASSPHRASE, store: db });
    if (verdict.status === 'locked') {
      res.setHeader('Retry-After', String(LOCKOUT_WINDOW_MINUTES * 60));
      return send(res, 429, authorizePage(p, orgs, 'Too many sign-in attempts'), 'text/html; charset=utf-8');
    }
    if (verdict.status !== 'ok') return send(res, 401, authorizePage(p, orgs, 'Incorrect passphrase'), 'text/html; charset=utf-8');
    const selected = orgs.find(org => org.id === p.neon_org);
    const chosenMode = p.mode || 'preview';
    if (!selected || !MODES.includes(chosenMode) ||
      (chosenMode === 'production' && (env.VERCEL_ENV !== 'production' || !selected.production_enabled)) ||
      !PROFILES.includes(p.profile || 'everyday') || !LISTINGS.includes(p.listing || default_listing) ||
      (p.project_scope && !scopes.includes(p.project_scope))) {
      return send(res, 400, authorizePage(p, orgs, 'Invalid org, mode, or connection settings'), 'text/html; charset=utf-8');
    }
    const code = randomToken(32);
    await db.createAuthCode({ code, clientId: p.client_id, redirectUri: p.redirect_uri,
      codeChallenge: p.code_challenge, codeChallengeMethod: 'S256', neonOrg: p.neon_org,
      projectScope: p.project_scope || null, mode: chosenMode,
      profile: p.profile || 'everyday', listing: p.listing || default_listing });
    const destination = new URL(p.redirect_uri);
    destination.searchParams.set('code', code);
    if (typeof p.state === 'string') destination.searchParams.set('state', p.state);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', destination.toString());
    return res.status(302).end();
  }
  async function token(req, res) {
    if (!only(res, req, ['POST'])) return;
    let p;
    try { p = paramsOf(req); } catch { return bad(res, 400, 'invalid_request', 'Malformed token request'); }
    if (!validateResource(p.resource)) return bad(res, 400, 'invalid_target', 'Token resource must be this MCP');
    const client = await db.getOAuthClient(str(p.client_id));
    // Old registrations remain confidential. A request cannot downgrade a
    // persisted client by choosing its own authentication method.
    const method = client?.token_endpoint_auth_method ?? 'client_secret_post';
    const header = req.headers?.authorization;
    const validPublic = method === 'none' && client?.client_secret_hash === null &&
      p.client_secret === undefined;
    const validSecret = method === 'client_secret_post' && typeof p.client_secret === 'string' &&
      !!p.client_secret && secretsMatch(hashToken(p.client_secret), client?.client_secret_hash);
    if (!client || header !== undefined || !(validPublic || validSecret)) {
      return bad(res, 401, 'invalid_client', 'Client credentials rejected');
    }
    if (p.grant_type === 'authorization_code') {
      if (!p.code || !client.redirect_uris.includes(p.redirect_uri) || !p.code_verifier) {
        return bad(res, 400, 'invalid_grant', 'Missing or invalid authorization details');
      }
      const record = await db.consumeAuthCode(p.code, { clientId: p.client_id, redirectUri: p.redirect_uri });
      if (!record || record.client_id !== p.client_id || record.redirect_uri !== p.redirect_uri ||
        !verifyPkce(p.code_verifier, record.code_challenge, record.code_challenge_method) ||
        (record.mode === 'production' && env.VERCEL_ENV !== 'production')) {
        return bad(res, 400, 'invalid_grant', 'Code is expired, used, or failed PKCE');
      }
      const accessToken = randomToken(32), refreshToken = randomToken(32);
      await db.createAccessToken({ accessToken, refreshToken, clientId: p.client_id,
        neonOrg: record.neon_org, projectScope: record.project_scope,
        mode: record.mode, profile: record.profile, listing: record.listing });
      return send(res, 200, tokenResponse(accessToken, refreshToken));
    }
    if (p.grant_type === 'refresh_token') {
      if (!str(p.refresh_token)) return bad(res, 400, 'invalid_grant', 'Missing refresh token');
      const original = await db.getTokenByRefreshToken(p.refresh_token);
      if (!original || original.client_id !== p.client_id ||
          (original.mode === 'production' && env.VERCEL_ENV !== 'production')) {
        return bad(res, 400, 'invalid_grant', 'Refresh credential is expired, used, or revoked');
      }
      const accessToken = randomToken(32), refreshToken = randomToken(32);
      const rotated = await db.rotateRefreshToken({ refreshToken: p.refresh_token, clientId: p.client_id,
        accessToken, newRefreshToken: refreshToken });
      if (!rotated) return bad(res, 400, 'invalid_grant', 'Refresh credential is expired, used, or revoked');
      return send(res, 200, tokenResponse(accessToken, refreshToken));
    }
    return bad(res, 400, 'unsupported_grant_type', 'Supported grants: authorization_code and refresh_token');
  }
  function metadata(req, res) {
    if (!only(res, req, ['GET'])) return;
    const { origin } = urls();
    return send(res, 200, { issuer: origin, authorization_endpoint: origin + '/api/oauth/authorize',
      token_endpoint: origin + '/api/oauth/token', registration_endpoint: origin + '/api/oauth/register',
      revocation_endpoint:origin+'/api/oauth/revoke',
      revocation_endpoint_auth_methods_supported:['client_secret_post','none'],
      response_types_supported: ['code'], grant_types_supported: ['authorization_code','refresh_token'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_post','none'] });
  }
  function resourceMetadata(req, res) {
    if (!only(res, req, ['GET'])) return;
    const { origin, resource } = urls();
    return send(res, 200, { resource, authorization_servers: [origin] });
  }
  return { register, authorize, token, metadata, resourceMetadata,
    revoke:createOAuthRevocation({db,env}) };
}
