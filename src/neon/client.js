// The only production Neon API entrypoint. Keep raw SDK access and credentials here.
import { createNeonClient } from '@neon/sdk';
import * as raw from '@neon/sdk/raw';
import { createHash } from 'node:crypto';
import { formatNeonError } from './errors.js';

export const NEON_SDK_VERSION = '7.0.1';
const RETRY_STATUSES = new Set([423, 429]);
const WITHOUT = new Set(['dryRun', 'confirm', 'fields', 'detail', 'requestKey']);
const DEFAULT_SLEEP = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).filter(k => !WITHOUT.has(k)).sort()
      .map(k => [k, canonical(value[k])]));
  }
  return value;
}

export function requestKey(ctx, tool, args, { now = Date.now() } = {}) {
  const explicit = args?.requestKey ?? ctx?.requestKey;
  if (explicit !== undefined) {
    if (typeof explicit !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(explicit))
      throw new TypeError('requestKey must be 8–128 safe characters.');
    return explicit;
  }
  if (!ctx?.neonOrg && !ctx?.orgId) throw new TypeError('Missing organization for request key');
  if (typeof tool !== 'string' || !/^[a-z][a-z0-9_]{1,80}$/.test(tool))
    throw new TypeError('Invalid tool name');
  const org = ctx.neonOrg ?? ctx.orgId;
  const project = ctx.projectId ?? ctx.project_scope ?? null;
  const bucket = Math.floor(now / 600000);
  const serialized = JSON.stringify({ org, project, tool, args: canonical(args ?? {}), bucket });
  const digest = createHash('sha256').update(serialized).digest('hex').slice(0, 24);
  return `rmcp_${tool}_${digest}_${bucket}`;
}

export function makeNeonClient({ key, orgId, budget, fetch, baseUrl, sleep = DEFAULT_SLEEP } = {}) {
  if (typeof key !== 'string' || !key) throw new Error('A Neon key is not configured.');
  // A-4b supplies the durable counter. Until then all callers must inject a budget;
  // missing budgets deny API access rather than silently disabling rate limiting.
  if (typeof budget?.consume !== 'function') throw new TypeError('A durable API budget is required.');
  if (typeof sleep !== 'function') throw new TypeError('sleep must be a function');
  const config = { apiKey: key, retries: 0, waitForReadiness: false,
    requestTimeoutMs: 8000, ...(orgId ? { orgId } : {}),
    ...(fetch ? { fetch } : {}), ...(baseUrl ? { baseUrl } : {}) };
  return Object.freeze({ sdk: createNeonClient(config).client, orgId, budget, sleep });
}

function safeError(error, fallbackStatus) {
  // Omit raw driver objects, response bodies, connection strings and request parameters.
  return formatNeonError({
    status: error?.status ?? error?.response?.status ?? fallbackStatus,
    message: error?.message,
    requestId: error?.requestId ?? error?.request_id,
    field: error?.field
  });
}
async function takeBudget(client) {
  const result = await client.budget.consume({ orgId: client.orgId, calls: 1 });
  if (result?.allowed === false || result === false) {
    return { code: 'rate_limited', status: 429,
      retryAfterSeconds: Number(result?.retryAfterSeconds) || 60 };
  }
  return null;
}
function isUncertain(error) {
  const status = Number(error?.status ?? error?.response?.status);
  return status >= 500 || (!status && ['network','timeout','aborted','fetch'].includes(error?.kind));
}

/** Bounded, explicit raw calls. Writes have a request key and are never blindly replayed. */
export async function call(client, operationId, params = {}, {
  write = false, requestKey: key, budgetMs = 10000
} = {}) {
  // SDK 7.0.1 omits this beta operation although our pinned OpenAPI documents it.
  // Use ONLY the SDK's own typed HTTP client and the exact vendored path template:
  // no hand-built URL, direct fetch or change to retries/admission.
  const recoverBranch = operationId === 'recoverProjectBranch' &&
    typeof raw.recoverProjectBranch !== 'function';
  if (!recoverBranch && typeof raw[operationId] !== 'function')
    throw new Error('Neon operation is not supported by the pinned SDK.');
  if (!client?.sdk || typeof client?.budget?.consume !== 'function') throw new TypeError('Invalid Neon client');
  if (write && (typeof key !== 'string' || !key)) throw new TypeError('Writes require a request key');
  const deadline = Date.now() + Math.max(0, Math.min(45000, budgetMs));
  for (let attempt = 0; attempt < 3; attempt++) {
    const budgetError = await takeBudget(client);
    if (budgetError) return { error: budgetError, confirmed: false };
    let result;
    try {
      result = recoverBranch
        ? await client.sdk.post({
          url: '/projects/{project_id}/branches/{branch_id}/recover',
          path: params.path
        })
        : await raw[operationId]({ client: client.sdk, ...params });
    } catch (error) {
      result = { error };
    }
    if (!result?.error) {
      return { data: result.data, operations: result.data?.operations || [], confirmed: true };
    }
    const error = result.error;
    const status = Number(error?.status ?? error?.response?.status);
    if (RETRY_STATUSES.has(status) && attempt < 2) {
      const delay = 500 * (2 ** attempt);
      if (Date.now() + delay > deadline) break;
      await client.sleep(delay);
      continue;
    }
    if (write && isUncertain(error)) {
      const existing = await findExisting(client, { projectId: params.path?.project_id, requestKey: key });
      return existing
        ? { data: existing, confirmed: true, recovered: true }
        : { error: { code: 'unknown_outcome', status: status || null }, confirmed: null };
    }
    return { error: safeError(error), confirmed: false };
  }
  return { error: { code: 'rate_limited', status: 429 }, confirmed: false };
}

/** Look up branch annotations on ambiguous branch creates; never infer success by name alone. */
export async function findExisting(client, { projectId, requestKey: key } = {}) {
  if (!projectId || !key) return null;
  const budgetError = await takeBudget(client);
  if (budgetError) return null;
  try {
    const result = await raw.listProjectBranches({ client: client.sdk,
      path: { project_id: projectId } });
    if (result.error) return null;
    const items = result.data?.branches || [];
    const annotations = result.data?.annotations || {};
    return items.find(item => {
      const annotation = annotations[item.id] || item.annotation || {};
      return annotation?.value?.rtc_request === key || annotation?.rtc_request === key;
    }) || null;
  } catch { return null; }
}

export async function listAll(fn, params, { max = 1000 } = {}) {
  if (typeof fn !== 'function') throw new TypeError('A page reader is required.');
  if (!Number.isInteger(max) || max < 1 || max > 1000) throw new TypeError('max must be 1–1000.');
  let cursor = null;
  const items = [], seen = new Set();
  while (items.length < max) {
    const result = await fn({ ...params, ...(cursor ? { cursor } : {}) });
    if (result?.error) return { items, capped: true, error: safeError(result.error) };
    const page = result?.data ?? result;
    const list = page?.items || page?.projects || page?.branches || page?.results;
    if (!Array.isArray(list)) throw new Error('Neon page has no recognized items array');
    items.push(...list.slice(0, max - items.length));
    const next = page?.pagination?.next ?? page?.pagination?.next_cursor ??
      page?.next_cursor ?? null;
    if (!next) return { items, capped: false };
    if (seen.has(next)) throw new Error('Neon returned a repeated pagination cursor');
    seen.add(next);
    cursor = next;
  }
  return { items, capped: true };
}
