// B-3b: explicitly authorized, bounded SQL reads. Deliberately unregistered until D-5.
// All trust decisions happen before obtaining credentials or opening a SQL connection.
import { classifySql } from './sql-guard.js';
import { classifyTarget } from './production.js';
import { checkProtectedTarget } from '../core/protected-resources.js';

const refused = (code, message) => ({ done: false, code, message });
const identifier = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{2,120}$/.test(x);
function safeValues(values) {
  return Array.isArray(values) && values.length <= 100 &&
    values.every(x => x === null || typeof x === 'string' && x.length <= 8192 ||
      typeof x === 'number' && Number.isFinite(x) ||
      typeof x === 'boolean');
}

/**
 * Read-only runner with trusted dependency injection; caller never supplies policy,
 * production classification, protected resources or branch identity.
 * Context: { connection, db, selfProject, getBranch, getProfile }.
 */
export async function runAuthorizedSqlRead({ ctx, target, text, params = [], sqlLayer } = {}) {
  const conn = ctx?.connection;
  const orgId = conn?.neonOrg ?? conn?.neon_org;
  const scope = conn?.projectScope ?? conn?.project_scope;
  if (typeof sqlLayer !== 'function' || !ctx?.db ||
      typeof ctx.db.getSqlReadPolicy !== 'function' ||
      !identifier(orgId) || !identifier(target?.projectId) ||
      !identifier(target?.branchId) || !identifier(target?.database) ||
      !identifier(target?.role) || (scope && scope !== target.projectId) ||
      !['preview', 'production'].includes(conn?.mode) ||
      typeof text !== 'string' || text.length > 20000 ||
      !safeValues(params)) return refused('not_authorized', 'SQL read requires a valid scoped connection and safe parameters.');
  const classification = await classifySql(text);
  if (classification.kind !== 'read')
    return refused('not_read_only', classification.reason || 'Only read-only SQL is allowed in the query tool.');
  // Even reads must refuse this server's own database and other owner-protected resources.
  if (await checkProtectedTarget(target, ctx) !== true)
    return refused('protected_resource', 'SQL is unavailable on a protected resource.');
  const trusted = await classifyTarget(ctx, target);
  if (!trusted.allowed)
    return refused('unverified_branch', 'The Neon branch identity could not be verified.');
  let policy;
  try { policy = await ctx.db.getSqlReadPolicy(); }
  catch { return refused('settings_unavailable', 'SQL read limits are unavailable.'); }
  if (!policy || typeof policy.productionReads !== 'boolean' ||
      !Number.isSafeInteger(policy.maxRows) || policy.maxRows < 1 || policy.maxRows > 200)
    return refused('settings_unavailable', 'SQL read limits are unavailable.');
  if (trusted.production && !policy.productionReads)
    return refused('production_reads_disabled', 'Production SQL reads are switched off in settings.');
  let result;
  try {
    result = await sqlLayer({ neonOrg: orgId, projectScope: scope || null },
      { projectId: target.projectId, branchId: target.branchId, database: target.database,
        role: target.role, pooled: target.pooled === true,
        ...(target.endpointId ? { endpointId: target.endpointId } : {}) },
      async client => {
        let began = false;
        try {
          await client.query('BEGIN READ ONLY');
          began = true;
          await client.query('SET LOCAL statement_timeout = 15000');
          await client.query('SET LOCAL lock_timeout = 5000');
          const raw = await client.query(text, params);
          // Responses are capped even if a caller supplies a much larger SQL LIMIT.
          const rows = Array.isArray(raw?.rows) ? raw.rows : [];
          const answer = { done: true, production: trusted.production,
            rows: rows.slice(0, policy.maxRows), rowCount: Math.min(rows.length, policy.maxRows),
            truncated: rows.length > policy.maxRows, maxRows: policy.maxRows };
          await client.query('COMMIT');
          return answer;
        } catch (error) {
          if (began) { try { await client.query('ROLLBACK'); } catch { /* cleanup best-effort */ } }
          return refused(error?.code === '25006' ? 'read_only_violation' :
            error?.code === '57014' ? 'sql_timeout' : 'sql_failed',
          error?.code === '25006' ? 'PostgreSQL refused a write in a read-only transaction.' :
            error?.code === '57014' ? 'The read-only SQL statement timed out.' :
              'The SQL query could not be completed safely.');
        }
      });
  } catch {
    return refused('connection_unavailable', 'The SQL connection could not be opened safely.');
  }
  // Never reflect provider errors or unchecked output from the SQL layer.
  return result?.done === true || result?.done === false
    ? result : refused('sql_failed', 'The SQL query returned an unexpected response.');
}
