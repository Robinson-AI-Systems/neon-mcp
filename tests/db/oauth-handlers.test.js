import { beforeAll, afterAll, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createDb } from '../../src/db.js';
import { createOAuthHandlers } from '../../src/core/oauth-handlers.js';
import { openIsolatedSchema, closeIsolatedSchema, neonShapedQuery } from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';

const env = { PUBLIC_BASE_URL: 'https://neon-mcp.example.test',
  ADMIN_PASSPHRASE: 'fake-owner-passphrase', VERCEL_ENV: 'preview' };
const resource = env.PUBLIC_BASE_URL + '/api/mcp';
const verifier = 'v'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const callback = 'https://client.example.test/cb';
const req = (method, body) => ({ method, headers: {}, query: method === 'GET' ? body : undefined,
  body: method === 'POST' ? body : undefined, socket: { remoteAddress: '192.0.2.99' } });
function res() { return { statusCode: 200, headers: {}, body: null,
  setHeader(k,v) { this.headers[k] = v; return this; },
  status(n) { this.statusCode = n; return this; },
  send(x) { this.body = x; return this; },
  json(x) { this.body = JSON.stringify(x); return this; },
  end() { return this; } }; }
const call = async (fn, r) => { const s = res(); await fn(r,s); return s; };
let db, h;
beforeAll(async () => {
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db = createDb(neonShapedQuery());
  await db.initSchema();
  const sql = neonShapedQuery();
  await sql`INSERT INTO neon_orgs(id, label) VALUES ('org-fake-owner', 'Example')`;
  h = createOAuthHandlers({ db, env });
});
afterAll(async () => { await closeIsolatedSchema(); });

it('completes persistent code exchange and refresh, preserving all five connection settings', async () => {
  const registered = JSON.parse((await call(h.register, req('POST', { redirect_uris:[callback] }))).body);
  const params = { client_id: registered.client_id, redirect_uri:callback, response_type:'code',
    code_challenge:challenge, code_challenge_method:'S256', resource,
    neon_org:'org-fake-owner', project_scope:'', mode:'preview', profile:'full', listing:'compact',
    passphrase:env.ADMIN_PASSPHRASE };
  const authorized = await call(h.authorize, req('POST', params));
  expect(authorized.statusCode).toBe(302);
  const code = new URL(authorized.headers.Location).searchParams.get('code');
  const grant = { grant_type:'authorization_code', client_id: registered.client_id,
    client_secret: registered.client_secret, redirect_uri:callback, code, code_verifier:verifier, resource };
  const firstResp = await call(h.token, req('POST',grant));
  expect(firstResp.statusCode).toBe(200);
  const first = JSON.parse(firstResp.body);
  expect((await db.getAccessToken(first.access_token))).toMatchObject({
    neon_org:'org-fake-owner', project_scope:null, mode:'preview', profile:'full', listing:'compact'
  });
  expect((await call(h.token, req('POST',grant))).statusCode).toBe(400);
  const refresh = { grant_type:'refresh_token', client_id:registered.client_id,
    client_secret:registered.client_secret, refresh_token:first.refresh_token, resource };
  const secondResp = await call(h.token, req('POST',refresh));
  expect(secondResp.statusCode).toBe(200);
  const second = JSON.parse(secondResp.body);
  expect((await db.getAccessToken(second.access_token))).toMatchObject({
    neon_org:'org-fake-owner', project_scope:null, mode:'preview', profile:'full', listing:'compact'
  });
  expect((await call(h.token, req('POST',refresh))).statusCode).toBe(400);
});

it('refuses production mode, forged project scope and an unknown organization', async () => {
  const registered = JSON.parse((await call(h.register, req('POST', { redirect_uris:[callback] }))).body);
  const base = { client_id:registered.client_id, redirect_uri:callback, response_type:'code',
    code_challenge:challenge, code_challenge_method:'S256', resource,
    neon_org:'org-fake-owner', profile:'full', listing:'catalog', passphrase:env.ADMIN_PASSPHRASE };
  for (const bad of [{ mode:'production' }, { project_scope:'proj-forged' }, { neon_org:'org-fake-missing' }]) {
    expect((await call(h.authorize, req('POST',{...base,...bad}))).statusCode).toBe(400);
  }
});
