// RAS MCP Standard — Muse connection design. Muse is given this server's
// own client document address as its Client ID. The server serves that
// document (MC-1), answers it locally at every door without a stored row or
// a network fetch (MC-2), accepts an omitted resource (MC-4), and completes
// authorize -> code exchange -> refresh -> revoke (MC-5).
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createFakeDb } from '../../test/helpers/fake-db.js';
import { createOAuthHandlers } from '../../src/core/oauth-handlers.js';
import { museClientDocument, ownMuseClient, MUSE_REDIRECT_URI, MUSE_CLIENT_ID } from '../../src/core/muse-client.js';
import museHandler from '../../api/well-known/muse-client.js';
import { resolveRoute } from '../../rack-server.mjs';

const ownerWord = ['fake', 'test', 'passphrase', 'muse'].join('-');
const env = { PUBLIC_BASE_URL: 'https://neon-mcp.example.test', ADMIN_PASSPHRASE: ownerWord };
const DOC = env.PUBLIC_BASE_URL + '/.well-known/muse-client.json';
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');

function request(method, data) {
  return { method, headers: {}, body: method === 'GET' ? undefined : data, query: method === 'GET' ? data : undefined,
    socket: { remoteAddress: '198.51.100.1' } };
}
function response() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(s) { this.statusCode = s; return this; },
    send(v) { this.body = v; return this; }, json(v) { this.body = JSON.stringify(v); return this; },
    end() { return this; } };
}
async function call(handler, req) { const res = response(); await handler(req, res); return res; }
const json = res => JSON.parse(res.body);
function fixture() {
  const db = createFakeDb({ orgs: [{ id: 'org-fake-one', label: 'My Business', production_enabled: false }] });
  let fetched = 0;
  const h = createOAuthHandlers({ db, env, fetchImpl: async () => { fetched++; throw new Error('no network'); },
    lookupImpl: async () => ['93.184.216.34'] });
  return { db, h, fetched: () => fetched };
}
const ask = (extra = {}) => ({ client_id: DOC, redirect_uri: MUSE_REDIRECT_URI, response_type: 'code',
  code_challenge: challenge, code_challenge_method: 'S256', state: 'muse-state', neon_org: 'org-fake-one',
  mode: 'preview', ...extra });

describe("Muse with this server's own client document", () => {
  it('serves the document at its well-known address, and the rack routes it', async () => {
    const old = process.env.PUBLIC_BASE_URL; process.env.PUBLIC_BASE_URL = env.PUBLIC_BASE_URL;
    try {
      const res = await call(museHandler, request('GET', {}));
      expect(res.statusCode).toBe(200);
      expect(json(res)).toEqual({ client_id: DOC, client_name: 'Muse', grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: [MUSE_REDIRECT_URI], response_types: ['code'], token_endpoint_auth_method: 'none' });
    } finally { if (old === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = old; }
    expect(resolveRoute('/.well-known/muse-client.json')).toBeTruthy();
    expect(resolveRoute('/.well-known/oauth-protected-resource/api/mcp')).toBeTruthy();
  });

  it('recognises exactly its own document and nothing that looks like it', () => {
    expect(ownMuseClient(DOC, env)).toMatchObject({ client_id: DOC, token_endpoint_auth_method: 'none', client_secret_hash: null });
    expect(museClientDocument(env).client_id).toBe(DOC);
    for (const other of ['Muse', 'muse ', DOC + '/', DOC + '?x=1', 'http://neon-mcp.example.test/.well-known/muse-client.json',
      'https://neon-mcp.example.test.evil.example/.well-known/muse-client.json', 'https://evil.example/.well-known/muse-client.json'])
      expect(ownMuseClient(other, env)).toBeNull();
  });

  it('completes authorize -> code -> refresh -> revoke with resource omitted, no stored row and no fetch', async () => {
    const { db, h, fetched } = fixture();
    expect(await db.getOAuthClient(DOC)).toBeFalsy();
    const page = await call(h.authorize, request('GET', ask()));
    expect(page.statusCode).toBe(200);
    const authorized = await call(h.authorize, request('POST', { ...ask(), passphrase: ownerWord }));
    expect(authorized.statusCode).toBe(302);
    const back = new URL(authorized.headers.Location);
    expect(back.origin + back.pathname).toBe(MUSE_REDIRECT_URI);
    const granted = await call(h.token, request('POST', { client_id: DOC, grant_type: 'authorization_code',
      redirect_uri: MUSE_REDIRECT_URI, code: back.searchParams.get('code'), code_verifier: verifier }));
    expect(granted.statusCode).toBe(200);
    const tokens = json(granted);
    const refreshed = await call(h.token, request('POST', { client_id: DOC, grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token }));
    expect(refreshed.statusCode).toBe(200);
    const revoked = await call(h.revoke, request('POST', { client_id: DOC, token: json(refreshed).refresh_token }));
    expect(revoked.statusCode).toBe(200);
    expect(fetched()).toBe(0);
  });

  // D-006 MC-8: plain `muse` is the easy Client ID anyone can type.
  it('accepts plain muse as the Client ID through the whole flow', async () => {
    expect(ownMuseClient(MUSE_CLIENT_ID, env)).toMatchObject({ client_id: 'muse', token_endpoint_auth_method: 'none' });
    const { db, h, fetched } = fixture();
    const authorized = await call(h.authorize, request('POST', { ...ask({ client_id: 'muse' }), passphrase: ownerWord }));
    expect(authorized.statusCode).toBe(302);
    const back = new URL(authorized.headers.Location);
    expect(back.origin + back.pathname).toBe(MUSE_REDIRECT_URI);
    const granted = await call(h.token, request('POST', { client_id: 'muse', grant_type: 'authorization_code',
      redirect_uri: MUSE_REDIRECT_URI, code: back.searchParams.get('code'), code_verifier: verifier }));
    expect(granted.statusCode).toBe(200);
    const refreshed = await call(h.token, request('POST', { client_id: 'muse', grant_type: 'refresh_token',
      refresh_token: json(granted).refresh_token }));
    expect(refreshed.statusCode).toBe(200);
    expect((await call(h.authorize, request('GET', ask({ client_id: 'muse', redirect_uri: 'https://evil.example/cb' })))).statusCode).toBe(400);
    expect(fetched()).toBe(0);
    expect(await db.getOAuthClient('muse')).toBeFalsy();
  });

  it('still refuses a wrong return address and a foreign resource', async () => {
    const { h } = fixture();
    expect((await call(h.authorize, request('GET', ask({ redirect_uri: 'https://evil.example/cb' })))).statusCode).toBe(400);
    expect((await call(h.authorize, request('GET', ask({ resource: 'https://evil.example/api/mcp' })))).statusCode).toBe(400);
  });
});
