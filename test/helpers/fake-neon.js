// Built for neon-mcp (A-1); the configure-then-record shape follows stripe-mcp test/helpers/fake-stripe.js @ f9a54f8.
// A fake Neon API reached through a `fetch` function (pass it to @neon/sdk's `fetch` option — A-4).
// Every request is checked against the vendored Neon API description: an undocumented method + path, an unknown or
// missing required body field, or an unknown query parameter fails the test with the path and the reason.
import { validateRequest, validateResponse } from './neon-spec.js';
import { loadFakeNeonSpec } from './o1-project-member-spec.js';

export const NEON_BASE_URL = 'https://console.neon.tech/api/v2';

const json = (status, body, headers = {}) => new Response(
  body === undefined ? null : JSON.stringify(body),
  { status, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers } }
);

export function makeFakeNeon({ index = loadFakeNeonSpec(), baseUrl = NEON_BASE_URL, requireAuth = true } = {}) {
  const calls = [];
  const problems = [];
  const queues = new Map();
  const ops = new Map();
  let defaultPolls = 0;

  const fail = (message, detail) => {
    problems.push({ message, ...detail });
    throw new Error(`Fake Neon: ${message}`);
  };

  // ---- operations (GET /projects/{project_id}/operations/{operation_id}) -------------------------------------
  const operations = {
    add(op, { polls = defaultPolls, outcome = 'finished', error } = {}) {
      ops.set(op.id, { op: structuredClone(op), remaining: polls, outcome, error });
      return op;
    },
    /** Each registered operation (and any added later) reports `running` n times, then its outcome. */
    finishAfter(n, id) {
      if (id) ops.get(id).remaining = n;
      else { defaultPolls = n; for (const entry of ops.values()) entry.remaining = n; }
    },
    fail(id, { error = 'operation failed', polls } = {}) {
      const entry = ops.get(id);
      if (!entry) throw new Error(`Fake Neon: unknown operation ${id}`);
      entry.outcome = 'failed';
      entry.error = error;
      if (polls !== undefined) entry.remaining = polls;
    },
    get: (id) => structuredClone(ops.get(id)?.op ?? null),
    ids: () => [...ops.keys()]
  };
  const registerOps = (body) => { for (const op of body?.operations || []) if (!ops.has(op.id)) operations.add(op); };

  function pollOperation(params) {
    const entry = ops.get(params.operation_id);
    if (!entry || entry.op.project_id !== params.project_id) return { status: 404, body: { code: '', message: 'operation not found' } };
    let status = entry.outcome;
    if (entry.remaining > 0) { entry.remaining -= 1; status = 'running'; }
    const op = { ...structuredClone(entry.op), status };
    if (status === 'failed') { op.error = entry.error; op.failures_count = 1; }
    return { status: 200, body: { operation: op } };
  }

  // ---- configuring responses -----------------------------------------------------------------------------
  function when(operationId) {
    const route = index.byId.get(operationId);
    if (!route) throw new Error(`Fake Neon: unknown operationId ${operationId}`);
    const queue = queues.get(operationId) || [];
    queues.set(operationId, queue);
    const documented = Object.keys(route.op.responses);
    const builder = {
      /** Successful response. `operations` (array) is placed on the body and registered for polling. */
      resolves(body, { status, operations: withOps, headers } = {}) {
        const code = status ?? (documented.includes('200') ? 200 : Number(documented.find((s) => /^2/.test(s))));
        const payload = body === undefined ? undefined : structuredClone(body);
        if (withOps) payload.operations = structuredClone(withOps);
        const errors = payload === undefined ? [] : validateResponse(index, operationId, code, payload);
        if (errors.length) throw new Error(`Fake Neon: fixture for ${operationId} does not match the description: ${errors.slice(0, 5).join('; ')}`);
        queue.push({ status: code, body: payload, headers });
        return builder;
      },
      /** Error response with Neon's documented error body ({ code, message }). */
      rejects(status, body = { code: '', message: `fake error ${status}` }, { headers } = {}) {
        const errors = validateResponse(index, operationId, status, body);
        if (errors.length) throw new Error(`Fake Neon: error body for ${operationId} does not match the description: ${errors.join('; ')}`);
        queue.push({ status, body: structuredClone(body), headers });
        return builder;
      }
    };
    return builder;
  }
  /** 423 Locked `times` times (another operation is running), then `body`. */
  const lockedThen = (operationId, body, { times = 1, ...opts } = {}) => {
    const b = when(operationId);
    for (let i = 0; i < times; i++) b.rejects(423, { code: '', message: 'project already has running conflicting operations, scheduling of new ones is prohibited' });
    return b.resolves(body, opts);
  };
  /** 429 Too Many Requests `times` times, with Retry-After seconds; then `then` (a body) when given. */
  const rateLimited = (operationId, { times = 1, retryAfter = 1, then } = {}) => {
    const b = when(operationId);
    for (let i = 0; i < times; i++) b.rejects(429, { code: '', message: 'rate limit exceeded' }, { headers: { 'retry-after': String(retryAfter) } });
    return then === undefined ? b : b.resolves(then);
  };

  // ---- the fetch the client uses ----------------------------------------------------------------------------
  async function fakeFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = (init.method || request?.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || request?.headers || {});
    let text = init.body ?? (request && method !== 'GET' && method !== 'HEAD' ? await request.text() : undefined);
    if (text instanceof Uint8Array) text = new TextDecoder().decode(text);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      fail(`request outside the Neon API base URL: ${method} ${url.origin}${url.pathname}`, { method, path: url.pathname });
    }
    const path = url.pathname.slice(base.pathname.length) || '/';
    const query = {};
    for (const [k, v] of url.searchParams) query[k] = k in query ? [].concat(query[k], v) : v;
    let body;
    if (text !== undefined && text !== null && text !== '') {
      try { body = JSON.parse(text); } catch { fail(`${method} ${path}: request body is not JSON`, { method, path }); }
    }
    const { operationId, params, errors } = validateRequest(index, { method, path, query, body });
    if (errors.length) fail(`${method} ${path}: ${errors.join('; ')}`, { method, path, operationId, errors });
    const auth = /^Bearer \S+/.test(headers.get('authorization') || '');
    calls.push({ operationId, method, path, params, query, body, auth });
    if (requireAuth && !auth) return json(401, { code: '', message: 'authentication required' });

    const queue = queues.get(operationId);
    let next;
    if (queue?.length) next = queue.length > 1 ? queue.shift() : queue[0];
    else if (operationId === 'getProjectOperation') next = pollOperation(params);
    else fail(`unconfigured call ${operationId} (${method} ${path}) — add fake.when('${operationId}')`, { method, path, operationId });
    if (next.status < 300) registerOps(next.body);
    return json(next.status, next.body === undefined ? undefined : structuredClone(next.body), next.headers);
  }

  return {
    fetch: fakeFetch, calls, problems, when, operations, lockedThen, rateLimited, baseUrl,
    /** Call in afterEach: fails if any request was refused, even one a client swallowed as a network error. */
    assertClean() { if (problems.length) throw new Error(`Fake Neon problems:\n${problems.map((p) => p.message).join('\n')}`); }
  };
}
