// B-3d private guarded SQL apply. D-5 owns public tool registration and write-contract doors.
// Never call this module with caller-provided trust services: ctx and sqlLayer are server-owned.
import { createHash } from 'node:crypto';
import { classifySql } from './sql-guard.js';
import { sqlScopeHash } from './sql-preview.js';
import { classifyTarget, checkProductionAccess } from './production.js';
import { checkProtectedTarget } from '../core/protected-resources.js';

const deny = (code, message) => ({ done: false, code, message });
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{2,120}$/.test(v);
const safeParams = (params, statements) =>
  Array.isArray(params) && params.length === statements.length &&
  params.every(row => Array.isArray(row) && row.length <= 100 &&
    row.every(value => value == null ||
      typeof value === 'string' && value.length <= 8192 ||
      typeof value === 'number' && Number.isFinite(value) ||
      typeof value === 'boolean'));
const lsnPattern = /^[0-9a-f]{1,8}\/[0-9a-f]{1,8}$/i;

/** A successful COMMIT is never assumed if the driver throws: leave audit pending. */
export async function applyGuardedSql({ ctx, target, statements, params, requestKey,
  previewToken, confirm = false, allowFullTable = false, sqlLayer, verifyReadBack } = {}) {
  const orgId = ctx?.connection?.neonOrg ?? ctx?.connection?.neon_org;
  const scope = ctx?.connection?.projectScope ?? ctx?.connection?.project_scope;
  const db = ctx?.db;
  if (!id(orgId) || !id(target?.projectId) || !id(target?.branchId) ||
      !id(target?.database) || !id(target?.role) ||
      scope && scope !== target.projectId ||
      !['preview', 'production'].includes(ctx?.connection?.mode) ||
      !['everyday', 'full'].includes(ctx?.connection?.profile) ||
      !Array.isArray(statements) || statements.length < 1 || statements.length > 20 ||
      statements.some(text => typeof text !== 'string' || text.length > 20000) ||
      !safeParams(params, statements) ||
      !/^rmcp_[a-z0-9_]{8,100}$/.test(requestKey || '') ||
      typeof sqlLayer !== 'function' || typeof verifyReadBack !== 'function' ||
      typeof ctx?.checkApp !== 'function' || typeof ctx?.sqlSpendAdmission !== 'function' ||
      typeof db?.reserveWrite !== 'function' || typeof db?.completeWrite !== 'function' ||
      typeof db?.consumeSqlPreview !== 'function' || typeof db?.recordSqlRestoreLsn !== 'function')
    return deny('not_authorized', 'SQL apply needs an authenticated, fully guarded server context.');
  if (confirm !== true) return deny('needs_confirmation', 'Confirm the proposed SQL changes before applying.');
  const classification = await Promise.all(statements.map(classifySql));
  if (classification.some(item => item.kind === 'read' || item.kind === 'refused'))
    return deny('sql_refused', 'Only classified SQL changes are accepted by the apply runner.');
  if (classification.some(item => item.fullTable) && allowFullTable !== true)
    return deny('full_table_confirmation', 'Unbounded updates and deletes require explicit confirmation.');
  if (await checkProtectedTarget(target, ctx) !== true)
    return deny('protected_resource', 'SQL on protected resources is not available.');
  const trusted = await classifyTarget(ctx, target);
  if (!trusted.allowed) return deny('unverified_branch', 'Neon could not verify this branch.');
  if (await ctx.checkApp(target, classification) !== true)
    return deny('application_owned', 'An application owns this schema or resource.');
  const access = await checkProductionAccess(target, ctx, { productionEffect: 'write' });
  if (!access.allowed) return deny('production_access_disabled', 'Production changes require owner-enabled access.');
  // B-4 spend admission is injected by the trusted D-5 caller, never optional and never from arguments.
  if (await ctx.sqlSpendAdmission({ orgId, target, classification, confirm }) !== true)
    return deny('spend_refused', 'Spending safety did not approve SQL execution.');

  const production = trusted.production === true;
  if (production && (typeof previewToken !== 'string' ||
      !/^[A-Za-z0-9_-]{40,100}$/.test(previewToken)))
    return deny('preview_required', 'Production SQL needs an unexpired exact-preview token.');
  if (!production && previewToken != null)
    return deny('unexpected_preview', 'A production preview token cannot be used for development SQL.');
  const targetName = target.projectId + '/' + target.branchId;
  // Reserve the request before consuming a token. A duplicate must never consume another token.
  let claimed;
  try {
    claimed = await db.reserveWrite({ orgId, projectId: target.projectId,
      branchId: target.branchId, mode: ctx.connection.mode,
      connectionId: ctx.connectionId ?? null, tool: 'neon_sql_execute',
      target: targetName, summary: 'Guarded SQL changes', production, requestKey });
  } catch {
    return deny('audit_unavailable', 'The durable SQL change audit could not be reserved.');
  }
  if (!claimed?.created) return deny('duplicate_request',
    'This request was already submitted; inspect its audit before retrying.');
  const claimId = claimed.id;
  async function finish(confirmed) {
    try { return await db.completeWrite({ id: claimId, orgId, confirmed }); }
    catch { return false; }
  }
  let expected = null;
  if (production) {
    let preview;
    try {
      const tokenHash = createHash('sha256').update(previewToken).digest('hex');
      preview = await db.consumeSqlPreview({ orgId, tokenHash,
        identityHash: sqlScopeHash({ orgId, target, statements, params }), target });
    } catch { /* fail closed */ }
    if (!preview || preview.production !== true ||
        !Array.isArray(preview.sql_expected_rows) ||
        preview.sql_expected_rows.length !== statements.length ||
        preview.sql_expected_rows.some(n => !Number.isSafeInteger(n) || n < 0)) {
      await finish('false');
      return deny('preview_mismatch', 'The exact SQL preview has expired, was used, or does not match.');
    }
    expected = preview.sql_expected_rows;
  }
  let outcome = 'pending', affectedRows = null, restoreLsnSaved = false;
  try {
    const result = await sqlLayer({ neonOrg: orgId, projectScope: scope || null },
      { projectId: target.projectId, branchId: target.branchId, database: target.database,
        role: target.role, pooled: false }, async client => {
        let begun = false, committing = false;
        try {
          await client.query('BEGIN');
          begun = true;
          await client.query('SET LOCAL lock_timeout = 5000');
          await client.query('SET LOCAL statement_timeout = 15000');
          if (production) {
            const wal = await client.query('SELECT pg_current_wal_lsn() AS restore_lsn');
            const lsn = wal?.rows?.[0]?.restore_lsn;
            if (typeof lsn !== 'string' || !lsnPattern.test(lsn) ||
                await db.recordSqlRestoreLsn({ orgId, id: claimId, lsn }) !== true)
              throw new Error('restore_point_unavailable');
            restoreLsnSaved = true;
          }
          const counts = [];
          for (let i = 0; i < statements.length; i++) {
            const changed = await client.query(statements[i], params[i]);
            const count = changed?.rowCount;
            if (!Number.isSafeInteger(count) && classification[i].kind !== 'ddl')
              throw new Error('unverified_row_count');
            counts.push(Number.isSafeInteger(count) ? count : 0);
            if (expected && counts[i] !== expected[i]) {
              await client.query('ROLLBACK');
              begun = false;
              return { status: 'mismatch', counts };
            }
          }
          committing = true;
          await client.query('COMMIT');
          begun = false;
          return { status: 'committed', counts };
        } catch {
          // COMMIT errors are ambiguous; do not claim a rollback or automatically retry.
          if (begun && !committing) {
            try { await client.query('ROLLBACK'); } catch { /* state remains unknown */ }
          }
          return { status: 'pending' };
        }
      });
    if (result?.status === 'mismatch') {
      outcome = 'false'; affectedRows = result.counts;
    } else if (result?.status === 'committed') {
      affectedRows = result.counts;
      // A domain-specific read-back is mandatory; false/unknown leaves the claim pending.
      try {
        if (await verifyReadBack({ ctx, target, classification, affectedRows }) === true)
          outcome = 'true';
      } catch { /* preserve pending */ }
    }
  } catch { /* SQL connection failure, including unknown commit outcome, is pending */ }
  if (!await finish(outcome))
    return deny('audit_unavailable', 'SQL outcome could not be verified against its audit. Inspect before retry.');
  if (outcome === 'false') return { ...deny('row_count_mismatch',
    'Affected rows did not match the exact preview; all changes were rolled back.'),
    expectedRows: expected, affectedRows };
  if (outcome !== 'true') return { done: false, confirmed: 'pending',
    code: 'apply_uncertain', message: 'The SQL outcome is uncertain; inspect the audit before retrying.',
    restorePointRecorded: restoreLsnSaved };
  return { done: true, confirmed: true, production, affectedRows,
    restorePointRecorded: restoreLsnSaved };
}
