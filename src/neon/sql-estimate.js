// B-3d: explicit estimate fallback ONLY for independently verified branch-limit/budget exhaustion.
// EXPLAIN is planned, never ANALYZE; the target is always read-only and never mutated by preview.
import { randomBytes, createHash } from 'node:crypto';
import { classifySql } from './sql-guard.js';
import { sqlScopeHash } from './sql-preview.js';
import { classifyTarget } from './production.js';
import { checkProtectedTarget } from '../core/protected-resources.js';

const deny = (code, message) => ({ done: false, code, message });
const id = x => typeof x === 'string' && /^[A-Za-z0-9_-]{2,120}$/.test(x);
function planRows(plan) {
  if (!plan || typeof plan !== 'object') return null;
  // ModifyTable nodes have Plan Rows = 0; scan child carries the useful estimate.
  if (plan['Node Type'] === 'ModifyTable' && Array.isArray(plan.Plans))
    return planRows(plan.Plans[0]);
  const n = plan['Plan Rows'];
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * Trusted server must prove the reason (branch limit or budget exhaustion) before fallback.
 * The resulting token carries sql_estimate=true; production apply additionally needs acceptEstimate.
 */
export async function createSqlEstimatedPreview({ ctx, target, statements, params,
  requestKey, reason, sqlLayer, allowFullTable = false } = {}) {
  const orgId = ctx?.connection?.neonOrg ?? ctx?.connection?.neon_org;
  const scope = ctx?.connection?.projectScope ?? ctx?.connection?.project_scope;
  if (!id(orgId) || !id(target?.projectId) || !id(target?.branchId) ||
      !id(target?.database) || !id(target?.role) || scope && scope !== target.projectId ||
      !['preview','production'].includes(ctx?.connection?.mode) ||
      !Array.isArray(statements) || statements.length < 1 || statements.length > 20 ||
      statements.some(s => typeof s !== 'string' || s.length > 20000) ||
      !Array.isArray(params) || params.length !== statements.length ||
      params.some(row => !Array.isArray(row) || row.length > 100 ||
        row.some(v => v != null && typeof v !== 'string' && typeof v !== 'number' &&
          typeof v !== 'boolean')) ||
      !/^rmcp_[a-z0-9_]{8,100}$/.test(requestKey || '') ||
      !['branch_limit','budget_exhausted'].includes(reason) ||
      typeof sqlLayer !== 'function' || typeof ctx?.verifyPreviewFallback !== 'function' ||
      typeof ctx?.db?.recordSqlEstimate !== 'function')
    return deny('estimate_not_authorized', 'Verified capacity exhaustion and a scoped SQL context are required.');
  if (await checkProtectedTarget(target, ctx) !== true)
    return deny('protected_resource', 'No SQL is available on a protected resource.');
  const trusted = await classifyTarget(ctx, target);
  if (!trusted.allowed || trusted.production !== true)
    return deny('not_production', 'This fallback is for verified production targets only.');
  const classes = await Promise.all(statements.map(classifySql));
  if (classes.some(item => !['write','destructive'].includes(item.kind)))
    return deny('cannot_estimate', 'DDL and unsupported SQL need an exact preview; no estimate token issued.');
  if (classes.some(item => item.fullTable) && allowFullTable !== true)
    return deny('full_table_confirmation', 'Unbounded changes require explicit full-table approval.');
  if (typeof ctx?.checkApp !== 'function' || await ctx.checkApp(target, classes) !== true)
    return deny('application_owned', 'Application ownership cannot be cleared.');
  if (await ctx.verifyPreviewFallback({ orgId, target, reason }) !== true)
    return deny('fallback_unverified', 'The capacity-limited preview fallback is not verified.');
  // This EXPLAIN is a READ ONLY transaction, even though the underlying parsed SQL is DML.
  let estimated;
  try {
    estimated = await sqlLayer({ neonOrg: orgId, projectScope: scope || null },
      { projectId: target.projectId, branchId: target.branchId,
        database: target.database, role: target.role, pooled: false }, async client => {
        await client.query('BEGIN READ ONLY');
        try {
          await client.query('SET LOCAL statement_timeout = 15000');
          await client.query('SET LOCAL lock_timeout = 5000');
          const rows = [];
          for (let i = 0; i < statements.length; i++) {
            // libpg-query validated exactly one statement before adding a constant EXPLAIN prefix.
            const value = await client.query('EXPLAIN (FORMAT JSON) ' + statements[i], params[i]);
            const parsed = value?.rows?.[0]?.['QUERY PLAN'];
            const estimate = planRows(Array.isArray(parsed) ? parsed[0]?.Plan : null);
            if (estimate == null) throw new Error('missing_estimate');
            rows.push(estimate);
          }
          await client.query('COMMIT');
          return rows;
        } catch {
          try { await client.query('ROLLBACK'); } catch { /* cleanup */ }
          throw new Error('estimate_unavailable');
        }
      });
  } catch {
    return deny('estimate_failed', 'PostgreSQL could not provide a bounded non-executing estimate.');
  }
  if (!Array.isArray(estimated) || estimated.length !== statements.length)
    return deny('estimate_failed', 'An estimated affected-row count is unavailable.');
  const previewToken = randomBytes(32).toString('base64url');
  try {
    await ctx.db.recordSqlEstimate({ orgId, target,
      tokenHash: createHash('sha256').update(previewToken).digest('hex'),
      identityHash: sqlScopeHash({ orgId, target, statements, params }),
      estimatedRows: estimated });
  } catch {
    return deny('estimate_not_recorded', 'The estimated preview could not be durably recorded.');
  }
  return { done: true, exact: false, estimated: true, production: true,
    affectedRowsEstimate: estimated, previewToken, validForMinutes: 30,
    requiresAcceptEstimate: true, warning: 'Counts are estimates, not a verified copy; the target was not modified.' };
}
