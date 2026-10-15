// B-3c exact SQL preview: a disposable Neon *child*, never the target.
// Private to the server. No public SQL mutation tools exist before D-5.
import { randomBytes, createHash } from 'node:crypto';
import { classifySql } from './sql-guard.js';
import { classifyTarget } from './production.js';
import { checkProtectedTarget } from '../core/protected-resources.js';
import { call } from './client.js';
import { waitForOperations } from './operations.js';
import { createSqlEstimatedPreview } from './sql-estimate.js';

const fail = (code, message) => ({ done: false, code, message });
const hash = x => createHash('sha256').update(x).digest('hex');
const validId = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{2,120}$/.test(x);
function safeParams(rows, statements) {
  return Array.isArray(rows) && rows.length === statements.length &&
    rows.every(row => Array.isArray(row) && row.length <= 100 &&
      row.every(v => v == null || typeof v === 'string' && v.length <= 8192 ||
        typeof v === 'number' && Number.isFinite(v) || typeof v === 'boolean'));
}
export function sqlScopeHash({ orgId, target, statements, params }) {
  return hash(JSON.stringify({ orgId, projectId: target.projectId, branchId: target.branchId,
    database: target.database, role: target.role, statements, params }));
}

/**
 * All dependencies including operation waiter, admission and SQL callback are server-owned.
 * Cost approval must be supplied by B-4 before any temporary branch is created.
 */
export async function createSqlExactPreview({ ctx, target, statements, params,
  requestKey, neonClient, sqlLayer, waiter = waitForOperations, now = Date.now,
 keepChild=false, recordChild=null, captureDiagnostics=false } = {}) {
  const orgId = ctx?.connection?.neonOrg ?? ctx?.connection?.neon_org;
  const scope = ctx?.connection?.projectScope ?? ctx?.connection?.project_scope;
  if (!validId(orgId) || !validId(target?.projectId) ||
      !validId(target?.branchId) || !validId(target?.database) ||
      !validId(target?.role) || scope && scope !== target.projectId ||
      !Array.isArray(statements) || statements.length < 1 || statements.length > 20 ||
      statements.some(s => typeof s !== 'string' || s.length > 20000) ||
      !safeParams(params, statements) || !/^rmcp_[a-z0-9_]{8,100}$/.test(requestKey || '') ||
      !neonClient || typeof sqlLayer !== 'function' ||
      typeof ctx?.db?.recordSqlPreview !== 'function' ||
      typeof ctx?.previewAdmission !== 'function' ||
      typeof ctx?.checkApp !== 'function'||
      (keepChild!==false&&(keepChild!==true||typeof recordChild!=='function'))||
      typeof captureDiagnostics!=='boolean')
    return fail('not_authorized', 'An authenticated and safety-checked SQL preview context is required.');
  const statementsInfo = await Promise.all(statements.map(classifySql));
  if (statementsInfo.some(x => x.kind === 'read' || x.kind === 'refused'))
    return fail('sql_not_previewable', 'Use the query tool for reads; unsupported SQL cannot be previewed.');
  if (statementsInfo.some(x => x.fullTable) && ctx?.allowFullTable !== true)
    return fail('full_table_confirmation', 'An unbounded update or delete requires allowFullTable.');
  if (!await checkProtectedTarget(target, ctx))
    return fail('protected_resource', 'SQL against an owner-protected resource is refused.');
  const cls = await classifyTarget(ctx, target);
  if (!cls.allowed) return fail('unverified_branch', 'The Neon parent branch could not be verified.');
  if (await ctx.checkApp(target, statementsInfo) !== true)
    return fail('application_owned', 'Another application owns this schema or resource.');
  // No permission defaults: B-4 must explicitly admit preview spend in the correct organization.
  if (await ctx.previewAdmission({ orgId, target, estimatedCostCents: 1 }) !== true) {
    if (typeof ctx.verifyPreviewFallback === 'function' &&
        await ctx.verifyPreviewFallback({ orgId, target, reason: 'budget_exhausted' }) === true)
      return createSqlEstimatedPreview({ ctx, target, statements, params, requestKey,
        reason: 'budget_exhausted', sqlLayer, allowFullTable: ctx.allowFullTable });
    return fail('spend_refused', 'Spending safety did not approve a disposable preview branch.');
  }
  if(keepChild&&cls.production)
    return fail('production_preview_only','Run-owned kept child cannot be created from a production target');
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const identityHash = sqlScopeHash({ orgId, target, statements, params });
  let createdChild = null, cleaned = true, countRows = null, schemaHash = null;
  let error = null, fallbackReason = null;
  let retainedChild=false,expiresAt=null;
  let statementDurationsMs=[],schemaDiff=null,sqlFailure=null,activeStatement=0;
  try {
    const expires = new Date(now() + 3600000).toISOString().replace('.000Z', 'Z');
    expiresAt=expires;
    const result = await call(neonClient, 'createProjectBranch', {
      path: { project_id: target.projectId },
      body: { branch: { parent_id: target.branchId, expires_at: expires },
        annotation_value: { rtc_preview: requestKey, rtc_request: requestKey },
        endpoints: [{ type: 'read_write', autoscaling_limit_min_cu: 0.25,
          autoscaling_limit_max_cu: 0.25 }] }
    }, { write: true, requestKey });
    if (result.error?.status === 422 && typeof ctx.verifyPreviewFallback === 'function' &&
        await ctx.verifyPreviewFallback({ orgId, target, reason: 'branch_limit' }) === true) {
      fallbackReason = 'branch_limit';
      throw new Error('verified_branch_limit');
    }
    const branch = result.data?.branch;
    if (!branch || result.confirmed !== true || !validId(branch.id) ||
        branch.id === target.branchId || branch.project_id !== target.projectId ||
        branch.parent_id !== target.branchId) throw new Error('unverified_child');
    createdChild = branch.id;
    const waited = await waiter(neonClient, target.projectId, result.operations || []);
    if (waited?.done !== true) throw new Error('child_not_ready');
    countRows = await sqlLayer({ neonOrg: orgId, projectScope: target.projectId },
      { projectId: target.projectId, branchId: createdChild,
        database: target.database, role: target.role, pooled: false }, async client => {
        let began = false;
        try {
          await client.query('BEGIN');
          began = true;
          await client.query('SET LOCAL lock_timeout = 5000');
          await client.query('SET LOCAL statement_timeout = 15000');
          const counts = [];
          for (let i = 0; i < statements.length; i++) {
            activeStatement=i+1;
            const beganAt=now();
            const result = await client.query(statements[i], params[i]);
            const elapsed=Math.max(0,now()-beganAt);
            if(!Number.isFinite(elapsed)||elapsed>86400000)
              throw new Error('invalid_statement_timing');
            statementDurationsMs.push(Math.round(elapsed));
            if (!Number.isSafeInteger(result.rowCount) && statementsInfo[i].kind !== 'ddl')
              throw new Error('unknown_affected_rows');
            counts.push(Number.isSafeInteger(result.rowCount) ? result.rowCount : 0);
          }
          await client.query('COMMIT');
          return counts;
        } catch (err) {
          if(captureDiagnostics)
            sqlFailure={statement:activeStatement||null,
              sqlstate:/^[A-Z0-9]{5}$/.test(err?.code||'')?err.code:null,
              reason:'Statement failed or exceeded the disposable child safety limits'};
          if (began) { try { await client.query('ROLLBACK'); } catch {} }
          throw err;
        }
      });
    if (!Array.isArray(countRows) || countRows.length !== statements.length)
      throw new Error('missing_child_counts');
    if (statementsInfo.some(x => x.kind === 'ddl')) {
      const diff = await call(neonClient, 'getProjectBranchSchemaComparison', {
        path: { project_id: target.projectId, branch_id: createdChild },
        query: { base_branch_id: target.branchId, db_name: target.database }
      });
      if (diff.error || !diff.data) throw new Error('schema_comparison_unavailable');
      schemaHash = hash(JSON.stringify(diff.data));
      if(captureDiagnostics){
        const raw=diff.data.diff;
        if(typeof raw!=='string'||Buffer.byteLength(raw)>16384||
           /(?:postgres(?:ql)?:\/\/|napi_[A-Za-z0-9]+|AKIA[0-9A-Z]{16})/.test(raw))
          throw new Error('unsafe_or_unbounded_schema_comparison');
        schemaDiff=raw;
      }
    }
    if(keepChild){
      // A kept child must remain a one-hour, readback-verified, run-owned
      // dev resource. If persistence fails, finally deletes it; a
      // still-unconfirmed provider result is never presented as success.
      const recorded=await recordChild({orgId,projectId:target.projectId,
        branchId:createdChild,parentBranchId:target.branchId,
        expiresAt,requestKey,neonClient});
      if(recorded!==true)throw new Error('run_ownership_unavailable');
      retainedChild=true;
    }
  } catch {
    error = 'Preview could not finish safely on the disposable branch.';
  } finally {
    if (createdChild&&!retainedChild) {
      try {
        const removed = await call(neonClient, 'deleteProjectBranch', {
          path: { project_id: target.projectId, branch_id: createdChild }
        }, { write: true, requestKey: requestKey + '_cleanup' });
        const wait = removed?.confirmed === true
          ? await waiter(neonClient, target.projectId, removed.operations || []) : null;
        cleaned = wait?.done === true;
      } catch { cleaned = false; }
    }
  }
  if (!cleaned) return fail('preview_cleanup_pending',
    'Disposable branch cleanup is unverified. Inspect the returned preview operation before trying again.');
  if (error && fallbackReason)
    return createSqlEstimatedPreview({ ctx, target, statements, params, requestKey,
      reason: fallbackReason, sqlLayer, allowFullTable: ctx.allowFullTable });
  if (error) return {...fail('preview_failed', error),
    ...(captureDiagnostics?{sqlFailure}: {})};
  if(retainedChild)return {done:true,exact:true,production:false,
    affectedRows:countRows,schemaChanged:Boolean(schemaHash),
    childKept:true,childDeleted:false,childBranchId:createdChild,
    childExpiresAt:expiresAt,
    ...(captureDiagnostics?{statementDurationsMs,schemaDiff,schemaHash}: {})};
  try {
    await ctx.db.recordSqlPreview({ orgId, target, tokenHash, identityHash,
      expectedRows: countRows, schemaHash, production: cls.production });
  } catch {
    return fail('preview_not_recorded', 'The preview could not be durably recorded; no apply token was issued.');
  }
  return { done: true, exact: true, production: cls.production,
    affectedRows: countRows, schemaChanged: Boolean(schemaHash), previewToken: token,
    validForMinutes: 30, childDeleted: true,
    ...(captureDiagnostics?{statementDurationsMs,schemaDiff,schemaHash}: {}) };
}
