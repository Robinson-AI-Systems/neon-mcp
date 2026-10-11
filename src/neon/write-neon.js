// Neon-specific side of the provider-neutral lifecycle. No tools registered by B-1.
import { call, requestKey } from './client.js';
import { waitForOperations } from './operations.js';

export function createNeonWriteContext({ connection, db, client, guards,
  deploymentEnv = process.env.VERCEL_ENV, connectionId = null } = {}) {
  if (!client || !db || !connection) throw new TypeError('Connection, client and audit database required');
  // No default-allow guard. B-2/B-3/B-4 must supply the real mechanisms.
  return Object.freeze({ connection, db, client, guards, deploymentEnv,
    connectionId, writeKey: (name, args) => requestKey({
      neonOrg: connection.neon_org, projectId: connection.project_scope
    }, name, args) });
}

/** Ambiguous Neon writes are never retried; the client performs narrow reconciliation. */
export async function applyNeonWrite({ client, operationId, params, projectId,
  requestKey: key, waitMs = 20000 } = {}) {
  if (!client || !operationId || !projectId || !key) throw new TypeError('Missing operation write context');
  const result = await call(client, operationId, params, { write: true, requestKey: key });
  if (result.error) return { confirmed: result.error.code === 'unknown_outcome'
    ? 'pending' : false, operations: [] };
  const operations = result.operations || [];
  if (!operations.length) return { confirmed: result.confirmed === true,
    operations: [], data: result.data };
  const waited = await waitForOperations(client, projectId, operations, { budgetMs: waitMs });
  return { confirmed: waited.confirmed === true ? true :
    waited.done === false ? false : 'pending',
  operations: waited.operations || operations, data: result.data };
}
