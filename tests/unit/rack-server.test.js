// RACK-2 route-table proof: the rack entrypoint dispatches every path
// the Vercel deployment serves to the same handler module, applies the
// vercel.json rewrites with their injected query parameters, and
// enforces each function's bodyParser contract. Database-backed legs
// are exercised against the rehearsal store on the rack; here the
// store is deliberately unconfigured, which pins the fail-closed
// shapes (503, never a hang or a stack leak).
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { resolveRoute, bodyLimitBytes, createRackServer, FILE_ROUTES } from '../../rack-server.mjs';

const SHA = 'b'.repeat(40);
const saved = {};
let server;
let base;

beforeAll(async () => {
  for (const key of ['PUBLIC_BASE_URL', 'VERCEL_GIT_COMMIT_SHA', 'DATABASE_URL', 'RTC1_ENABLED', 'HEALTH_DB_PROBE_ENABLED']) {
    saved[key] = process.env[key];
  }
  process.env.PUBLIC_BASE_URL = 'https://neon.example.test';
  process.env.VERCEL_GIT_COMMIT_SHA = SHA;
  delete process.env.DATABASE_URL;
  delete process.env.RTC1_ENABLED;
  delete process.env.HEALTH_DB_PROBE_ENABLED;
  server = createRackServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('route table', () => {
  it('binds every api function file at its Vercel path', () => {
    expect(FILE_ROUTES.size).toBe(18);
    for (const [path, entry] of FILE_ROUTES) {
      expect(typeof entry.handler, path).toBe('function');
      const resolved = resolveRoute(path);
      expect(resolved.handler, path).toBe(entry.handler);
    }
  });

  it('serves the front door at /, /api and /api/index (Q-1 dual binding)', () => {
    const door = FILE_ROUTES.get('/api/index').handler;
    expect(resolveRoute('/').handler).toBe(door);
    expect(resolveRoute('/api').handler).toBe(door);
    expect(resolveRoute('/api/index').handler).toBe(door);
  });

  it('applies the vercel.json rewrites verbatim', () => {
    expect(resolveRoute('/connection').handler).toBe(FILE_ROUTES.get('/api/connection').handler);
    expect(resolveRoute('/.well-known/oauth-authorization-server').handler)
      .toBe(FILE_ROUTES.get('/api/well-known/oauth-authorization-server').handler);
    expect(resolveRoute('/.well-known/oauth-protected-resource').handler)
      .toBe(FILE_ROUTES.get('/api/well-known/oauth-protected-resource').handler);
  });

  it('injects the RTC door parameters from the rewrites', () => {
    const rtcHandler = FILE_ROUTES.get('/api/rtc').handler;
    expect(resolveRoute('/api/tools')).toMatchObject({ handler: rtcHandler, query: { door: 'tools' } });
    expect(resolveRoute('/api/tools/neon_list_projects'))
      .toMatchObject({ handler: rtcHandler, query: { door: 'tools', name: 'neon_list_projects' } });
    expect(resolveRoute('/api/whoami')).toMatchObject({ handler: rtcHandler, query: { door: 'whoami' } });
    expect(resolveRoute('/api/results/abc-123'))
      .toMatchObject({ handler: rtcHandler, query: { door: 'results', handle: 'abc-123' } });
  });

  it('returns null for paths Vercel would not serve', () => {
    expect(resolveRoute('/nope')).toBeNull();
    expect(resolveRoute('/api/tools/a/b')).toBeNull();
    expect(resolveRoute('/api/oauth')).toBeNull();
  });

  it('derives body limits from each function config', () => {
    expect(bodyLimitBytes(FILE_ROUTES.get('/api/rtc').config)).toBe(16 * 1024);
    expect(bodyLimitBytes(FILE_ROUTES.get('/api/mcp').config)).toBe(4_572_800);
    expect(bodyLimitBytes(undefined)).toBe(4_572_800);
    expect(bodyLimitBytes({ api: { bodyParser: false } })).toBe(0);
    expect(bodyLimitBytes({ api: { bodyParser: { sizeLimit: '1mb' } } })).toBe(1024 * 1024);
  });
});

describe('live dispatch on an ephemeral port', () => {
  it('answers health with the pinned shape, honestly degraded without a store', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['revision', 'status', 'timestamp', 'tools', 'version']);
    expect(body).toMatchObject({ status: 'degraded', revision: SHA, tools: 139 });
  });

  it('serves the front door and connection page as HTML', async () => {
    for (const path of ['/', '/api']) {
      const res = await fetch(`${base}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(await res.text()).toContain('Neon Unleashed by Robinson AI Systems');
    }
    const connection = await fetch(`${base}/connection`);
    expect(connection.status).toBe(200);
    expect(await connection.text()).toContain('My connection');
  });

  it('fails OAuth discovery closed while the store is unconfigured', async () => {
    // handleOAuth opens the store before dispatching EVERY route,
    // metadata included, so an unconfigured store answers the same
    // fail-closed 503 the Vercel deployment gives in that state — the
    // entrypoint reproduces it, it does not paper over it. Discovery
    // 200 with the issuer from the configured origin is proven against
    // the rehearsal store on the rack (RACK-2 acceptance).
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('temporarily_unavailable');
  });

  it('serves the contract door at its RTC-gated shape while RTC is disabled', async () => {
    // RTC 1 stays off in production by design (the dossier's parity
    // posture), so the contract door answers 503 with the in-progress
    // notice; the release identity rides the manifest once RTC opens.
    const res = await fetch(`${base}/api/contract`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('rtc_integration_in_progress');
  });

  it('serves the OpenAPI document (the rack readiness target)', async () => {
    const res = await fetch(`${base}/api/openapi.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
  });

  it('refuses the MCP door closed when the store is unconfigured', async () => {
    const res = await fetch(`${base}/api/mcp`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('temporarily_unavailable');
  });

  it('keeps the RTC doors at their by-design 503 while RTC is disabled', async () => {
    const res = await fetch(`${base}/api/tools`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('neon_list_projects');
  });

  it('enforces the RTC 16 KB body limit at the platform leg', async () => {
    const res = await fetch(`${base}/api/tools`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(17 * 1024) }) });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('payload_too_large');
  });

  it('answers malformed JSON with the platform 400 before any handler', async () => {
    const res = await fetch(`${base}/api/mcp`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: '{not json' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('passes method enforcement through to the handlers', async () => {
    const res = await fetch(`${base}/api/health`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('404s unknown paths in the service error shape', async () => {
    const res = await fetch(`${base}/definitely-not-a-route`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});
