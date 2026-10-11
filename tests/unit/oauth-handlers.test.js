import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createFakeDb } from '../../test/helpers/fake-db.js';
import { createOAuthHandlers } from '../../src/core/oauth-handlers.js';
import { requireMcpToken } from '../../src/core/mcp-auth.js';

const env = { PUBLIC_BASE_URL: 'https://neon-mcp.example.test', ADMIN_PASSPHRASE: 'FAKE_only-the-owner-knows' };
const resource = env.PUBLIC_BASE_URL + '/api/mcp';
const callback = 'https://client.example.test/cb';
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
function request(method, data, headers = {}) {
  return { method, headers, body: method === 'GET' ? undefined : data, query: method === 'GET' ? data : undefined,
    socket: { remoteAddress: '198.51.100.1' } };
}
function response() {
  return { statusCode: 200, headers: {}, body: null, ended: false,
    setHeader(k,v) { this.headers[k] = v; return this; },
    status(s) { this.statusCode = s; return this; },
    send(v) { this.body = v; return this; },
    json(v) { this.body = JSON.stringify(v); return this; },
    end() { this.ended = true; return this; }
  };
}
async function call(handler, req) {
  const res = response();
  await handler(req,res);
  return res;
}
function json(res) { return JSON.parse(res.body); }
function createFixture() {
  let now = Date.now();
  const db = createFakeDb({ clock: () => now, orgs: [{ id: 'org-fake-one', label: 'My Business', production_enabled: false }] });
  return { db, h: createOAuthHandlers({ db, env }), now: () => now, advance: n => { now += n; } };
}
async function register(h) {
  const res = await call(h.register, request('POST', { redirect_uris: [callback], client_name: 'Personal agent' }));
  expect(res.statusCode).toBe(201);
  return json(res);
}
function authorizeArgs(client) {
  return { client_id: client.client_id, redirect_uri: callback, response_type: 'code', code_challenge: challenge,
    code_challenge_method: 'S256', resource, state: 'nonce123', neon_org: 'org-fake-one',
    project_scope: '', mode: 'preview', profile: 'full', listing: 'compact' };
}
describe('personal-use OAuth HTTP endpoints', () => {
  it('publishes fixed HTTPS metadata and does not advertise weak PKCE', async () => {
    const { h } = createFixture();
    const auth = json(await call(h.metadata, request('GET', {})));
    expect(auth.issuer).toBe(env.PUBLIC_BASE_URL);
    expect(auth.code_challenge_methods_supported).toEqual(['S256']);
    expect(json(await call(h.resourceMetadata, request('GET', {}))).resource).toBe(resource);
  });
  it('rejects insecure redirect URIs and unsupported public-client auth', async () => {
    const { h } = createFixture();
    const res = await call(h.register, request('POST', { redirect_uris: ['http://evil.example.test/cb'] }));
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toBe('invalid_client_metadata');
  });
  it('one setup persists through access expiration and rotates refresh without a new login', async () => {
    const { db, h, advance } = createFixture();
    const client = await register(h);
    const p = authorizeArgs(client);
    const page = await call(h.authorize, request('GET', p));
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('My Business');
    expect(page.body).toContain('All projects');
    expect(page.body).toContain('value="full" selected');
    const authorized = await call(h.authorize, request('POST', { ...p, passphrase: env.ADMIN_PASSPHRASE }));
    expect(authorized.statusCode).toBe(302);
    const code = new URL(authorized.headers.Location).searchParams.get('code');
    const wrongSecret = await call(h.token, request('POST', {
      grant_type: 'authorization_code', client_id: client.client_id,
      client_secret: 'wrong-client-secret', redirect_uri: callback,
      code, code_verifier: verifier, resource }));
    expect(wrongSecret.statusCode).toBe(401);
    expect(json(wrongSecret).error).toBe('invalid_client');
    const granted = await call(h.token, request('POST', { grant_type: 'authorization_code',
      client_id: client.client_id, client_secret: client.client_secret, redirect_uri: callback,
      code, code_verifier: verifier, resource }));
    expect(granted.statusCode).toBe(200);
    const original = json(granted);
    expect(original.expires_in).toBe(3600);
    expect((await db.getAccessToken(original.access_token))).toMatchObject({
      neon_org: 'org-fake-one', project_scope: null, mode: 'preview', profile: 'full', listing: 'compact'
    });
    expect((await call(h.token, request('POST', { grant_type: 'authorization_code',
      client_id: client.client_id, client_secret: client.client_secret, redirect_uri: callback,
      code, code_verifier: verifier, resource }))).statusCode).toBe(400);
    // Simulate 45 days of inactivity: the access token expired long ago; its
    // hashed refresh credential must still work without a new owner sign-in.
    advance(45 * 86400 * 1000);
    expect(await db.getAccessToken(original.access_token)).toBeNull();
    const refreshed = await call(h.token, request('POST', {
      grant_type: 'refresh_token', client_id: client.client_id,
      client_secret: client.client_secret, refresh_token: original.refresh_token, resource }));
    expect(refreshed.statusCode).toBe(200);
    const second = json(refreshed);
    expect(await db.getAccessToken(second.access_token)).toMatchObject({
      neon_org: 'org-fake-one', project_scope: null, profile: 'full', listing: 'compact'
    });
    const replay = await call(h.token, request('POST', { grant_type: 'refresh_token',
      client_id: client.client_id, client_secret: client.client_secret,
      refresh_token: original.refresh_token, resource }));
    expect(replay.statusCode).toBe(400);
    expect(json(replay).error).toBe('invalid_grant');
    expect((await call(h.token, request('POST', {
      grant_type: 'refresh_token', client_id: 'fake-other-client', client_secret: client.client_secret,
      refresh_token: second.refresh_token, resource }))).statusCode).toBe(401);
    expect((await call(h.token, request('POST', {
      grant_type: 'refresh_token', client_id: client.client_id, client_secret: client.client_secret,
      refresh_token: second.refresh_token, resource: 'https://elsewhere.example.test/api/mcp'
    }))).statusCode).toBe(400);
  });
  it('refuses forged production mode even with the correct admin passphrase', async () => {
    const { h } = createFixture();
    const client = await register(h);
    const result = await call(h.authorize, request('POST',
      { ...authorizeArgs(client), mode: 'production', passphrase: env.ADMIN_PASSPHRASE }));
    expect(result.statusCode).toBe(400);
  });
  it('blocks unknown project scope and absent organizations', async () => {
    const { h } = createFixture();
    const client = await register(h);
    const forged = await call(h.authorize, request('POST', {
      ...authorizeArgs(client), project_scope: 'proj-fake-forged', passphrase: env.ADMIN_PASSPHRASE
    }));
    expect(forged.statusCode).toBe(400);
    const noOrgDb = createFakeDb();
    const noOrg = createOAuthHandlers({ db: noOrgDb, env });
    const missing = await call(noOrg.authorize, request('POST', {
      ...authorizeArgs(client), passphrase: env.ADMIN_PASSPHRASE
    }));
    expect(missing.statusCode).toBe(400);
  });
  it('does not allow preview servers to use production-scoped tokens', async () => {
    const { db } = createFixture();
    const production = createOAuthHandlers({ db, env: { ...env, VERCEL_ENV: 'production' } });
    const c = await register(production);
    // An organization must separately be production-enabled; missing flag refuses.
    const denied = await call(production.authorize, request('POST', {
      ...authorizeArgs(c), mode: 'production', passphrase: env.ADMIN_PASSPHRASE
    }));
    expect(denied.statusCode).toBe(400);
    await db.createAccessToken({ accessToken: 'q'.repeat(60), clientId: c.client_id,
      neonOrg: 'org-fake-one', mode: 'production', profile: 'full', listing: 'catalog' });
    const preview = await requireMcpToken(request('POST', {}, { authorization: 'Bearer ' + 'q'.repeat(60) }),
      response(), db, { ...env, VERCEL_ENV: 'preview' });
    expect(preview?.mode).toBe('preview');
  });
  it('locks the user after five wrong passwords; valid password cannot bypass it', async () => {
    const { h } = createFixture();
    const client = await register(h), p = authorizeArgs(client);
    for (let i = 0; i < 5; i++) {
      const r = await call(h.authorize, request('POST',{ ...p, passphrase: 'wrong' }));
      expect(r.statusCode).toBe(401);
    }
    const locked = await call(h.authorize, request('POST',{ ...p, passphrase: env.ADMIN_PASSPHRASE }));
    expect(locked.statusCode).toBe(429);
  });
  it('never allows MCP access without a valid scoped bearer', async () => {
    const { db } = createFixture();
    const missing = response();
    expect(await requireMcpToken(request('POST', {}), missing, db, env)).toBeNull();
    expect(missing.statusCode).toBe(401);
    await db.createAccessToken({ accessToken: 'a'.repeat(60), refreshToken: 'b'.repeat(60),
      clientId: 'owner', neonOrg: 'org-fake-one', profile: 'full', mode: 'preview', listing: 'compact' });
    const allowed = await requireMcpToken(request('POST', {}, { authorization: 'Bearer ' + 'a'.repeat(60) }),
      response(), db, env);
    expect(allowed).toMatchObject({ neonOrg: 'org-fake-one', projectScope: null, mode: 'preview', profile: 'full' });
    const other = response();
    expect(await requireMcpToken(request('POST', {},
      { authorization: 'Bearer ' + 'x'.repeat(60) }), other, db, env)).toBeNull();
    expect(other.statusCode).toBe(401);
  });
});

describe('C-2 OAuth client listing defaults',()=>{
 it('defaults other clients to compact and a registered Claude client to catalog',async()=>{
  const {db,h}=createFixture();
  for(const [label,expected] of [['Personal agent','compact'],['Claude Desktop','catalog']]){
   const response=await call(h.register,request('POST',{redirect_uris:[callback],client_name:label}));
   const client=json(response);
   const p=authorizeArgs(client);
   delete p.listing;
   const page=await call(h.authorize,request('GET',p));
   expect(page.body).toContain('value="'+expected+'" selected');
   const posted=await call(h.authorize,request('POST',{...p,passphrase:env.ADMIN_PASSPHRASE}));
   expect(posted.statusCode).toBe(302);
   const code=new URL(posted.headers.Location).searchParams.get('code');
   const stored=await db.consumeAuthCode(code);
   expect(stored.listing).toBe(expected);
  }
 });
});