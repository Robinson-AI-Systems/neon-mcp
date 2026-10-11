// Provider-neutral guarded write lifecycle; no Neon client or SQL imports.
// Not registered as a tool. Until B-2/B-3/B-4, callers MUST inject all four guards.
import { redactNeonText } from './scrub.js';
const validName = /^[a-z][a-z0-9_]{2,80}$/;
const respond = (value, error = false) => ({
  ...(error ? { isError: true } : {}),
  content: [{ type: 'text', text: JSON.stringify(value) }]
});
const deny = (reason, code = 'refused_by_guard') => respond({
  done: false, code, message: reason
}, true);

function required(fn, label) {
  if (typeof fn !== 'function') throw new TypeError(label + ' must be a function');
}
function isSafeSummary(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= 1024 &&
    redactNeonText(s) === s &&
    !/(?:postgres(?:ql)?:\/\/|napi_|npg_|authorization:|bearer\s)/i.test(s);
}
function safeInverse(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) ||
      !validName.test(value.tool) || typeof value.args !== 'object' ||
      !value.args || Array.isArray(value.args)) return null;
  // Until the comprehensive B-6 scrubber, persist ONLY identifier-shaped
  // fields; never arguments that may contain account data or credentials.
  const permitted = /^([a-z]+_)?(id|project_id|branch_id|operation_id)$/;
  const clean = Object.fromEntries(Object.entries(value.args).filter(([k,v]) =>
    permitted.test(k) && typeof v === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(v)));
  return Object.keys(clean).length === Object.keys(value.args).length
    ? { tool: value.tool, args: clean } : null;
}

/** Define an audited write without exposing raw results or bypassing later guards. */
export function defineWrite({
  name, plan, apply, readAfter, verify, inverse = () => null,
  destructive = false, productionEffect = 'write', spend = null,
  access = false, secret = false, key = 'project', projectWide = false,
  needsConfirm = true
} = {}) {
  if (!validName.test(name || '')) throw new TypeError('Invalid write tool name');
  for (const [n, fn] of Object.entries({ plan, apply, readAfter, verify, inverse })) required(fn, n);
  if (spend != null) required(spend, 'spend');
  if (!['write','none'].includes(productionEffect) || !['project','org'].includes(key))
    throw new TypeError('Invalid production effect or key kind');
  if ([destructive, access, secret, projectWide, needsConfirm].some(x=>typeof x !== 'boolean'))
    throw new TypeError('Write flags must be booleans');
  const tool = Object.freeze({
    name, description: 'Preview a guarded change; confirm where required.',
    writes: true, writeContract: 'defineWrite-v1',
    destructive, productionEffect, access, secret, key, projectWide,
    spend: spend != null,
    inputSchema: { type: 'object', properties: {
      dryRun: { type: 'boolean' }, confirm: { type: 'boolean' },
      requestKey: { type: 'string', minLength: 8, maxLength: 128 }
    }, additionalProperties: true }
  });
  async function handler(args, ctx) {
    if (!args || typeof args !== 'object' || Array.isArray(args) ||
        (args.dryRun !== undefined && typeof args.dryRun !== 'boolean') ||
        (args.confirm !== undefined && typeof args.confirm !== 'boolean'))
      return deny('Invalid write arguments.', 'invalid_request');
    const connection = ctx?.connection;
    const orgId = connection?.neon_org ?? connection?.neonOrg;
    if (!orgId || !['preview','production'].includes(connection.mode) ||
        !['everyday','full'].includes(connection.profile) ||
        (key === 'org' && connection.profile !== 'full'))
      return deny('This connection cannot make changes.', 'not_authorized');
    if (ctx?.deploymentEnv && ctx.deploymentEnv !== 'production' &&
        connection.mode === 'production')
      return deny('Production mode is unavailable from a preview deployment.');
    if (typeof ctx?.db?.recordWritePreview !== 'function' ||
        typeof ctx?.db?.reserveWrite !== 'function' ||
        typeof ctx?.db?.completeWrite !== 'function' ||
        typeof ctx?.writeKey !== 'function')
      return deny('The durable audit database is unavailable.');
    const guards = ctx?.guards;
    if (['checkProtected','checkProduction','checkApp','checkSpend'].some(k =>
      typeof guards?.[k] !== 'function'))
      return deny('One or more safety checks are unavailable.');
    let intended;
    try {
      intended = await plan(args, ctx);
      if (!intended || !isSafeSummary(intended.summary) ||
          typeof intended.target !== 'string' || !intended.target)
        return deny('Could not make a safe change preview.');
      // The plan must use current Neon state; never accept an args-supplied production flag.
      const pg = await guards.checkProtected(intended, ctx);
      if (pg !== true) return deny('This resource is protected from changes.');
      const app = await guards.checkApp(intended, ctx, args);
      if (app !== true) return deny('This resource is owned by another application.');
      const production = await guards.checkProduction(intended, ctx, tool);
      if (!production || production.allowed !== true ||
          typeof production.production !== 'boolean')
        return deny('Production access is disabled; ask the owner to enable it.');
      const affectsProduction = production.production && productionEffect === 'write';
      if (affectsProduction && connection.mode !== 'production')
        return deny('Production change refused in preview mode. Ask the owner to enable production, then reconnect.');
      let estimate = null;
      if (spend) {
        estimate = await spend(args, ctx, intended.before);
        if (!estimate || !Number.isSafeInteger(estimate.increaseCents) ||
            estimate.increaseCents < 0)
          return deny('A reliable spending preview is unavailable.');
      }
      const money = await guards.checkSpend(estimate, intended, ctx);
      if (money !== true) return deny('Spending limit or approval not available.');
      const summary = (affectsProduction ? 'PRODUCTION: ' : '') + intended.summary;
      const mustConfirm = needsConfirm || destructive || access || secret ||
        Boolean(spend) || affectsProduction;
      const preview = { done: false, preview: summary,
        needsConfirmation: mustConfirm && args.confirm !== true,
        ...(estimate ? { spendMonthCents: estimate.increaseCents } : {}) };
      if (args.dryRun === true) {
        await ctx.db.recordWritePreview({ orgId, projectId: intended.projectId ?? null,
          branchId: intended.branchId ?? null, mode: connection.mode,
          connectionId: ctx.connectionId ?? null, tool: name,
          target: intended.target, summary, production: affectsProduction });
        return respond(preview);
      }
      if (mustConfirm && args.confirm !== true)
        return respond({ ...preview, code: 'needs_confirmation',
          message: 'Review the preview, then set confirm: true to apply.' });
      const requestKey = ctx.writeKey(name, args);
      if (typeof requestKey !== 'string' || !/^rmcp_[a-z0-9_]{5,128}$/.test(requestKey))
        return deny('A stable request key is required.');
      const claim = await ctx.db.reserveWrite({ orgId,
        projectId: intended.projectId ?? null, branchId: intended.branchId ?? null,
        mode: connection.mode, connectionId: ctx.connectionId ?? null,
        tool: name, target: intended.target, summary, production: affectsProduction,
        requestKey, spendCents: estimate?.increaseCents ?? null });
      if (!claim?.created) {
        if (!claim?.existing || claim.existing.neon_org !== orgId ||
            claim.existing.tool !== name ||
            claim.existing.project_id !== (intended.projectId ?? null) ||
            claim.existing.branch_id !== (intended.branchId ?? null) ||
            claim.existing.target !== intended.target)
          return deny('This request key is already reserved.');
        const saved = claim.existing.confirmed;
        return respond({ done: saved === 'true', confirmed: saved === 'true' ? true :
          saved === 'false' ? false : 'pending', requestKey,
        message: 'Existing attempt returned; no second write was sent.' });
      }
      let status = 'pending', ops = [], verified = null;
      try {
        const applied = await apply(args, ctx, { before: intended.before, requestKey });
        ops = Array.isArray(applied?.operations) ? applied.operations
          .map(op => typeof op === 'string' ? op : op.id).filter(Boolean) : [];
        if (applied?.confirmed === false) status = 'false';
        else if (applied?.confirmed === 'pending' || applied?.confirmed == null)
          status = 'pending';
        else {
          const after = await readAfter(args, ctx, intended.before);
          verified = await verify(intended.before, after, args, ctx);
          status = verified === true ? 'true' : 'false';
        }
      } catch {
        // Transport errors may mean Neon accepted the write. Never replay.
        status = 'pending';
      }
      let inverseOp = null;
      if (status === 'true') {
        try { inverseOp = safeInverse(await inverse(args, intended.before, ctx)); }
        catch { inverseOp = null; } // An optional inverse must not prevent audit finalization.
      }
      await ctx.db.completeWrite({ id: claim.id, orgId, confirmed: status,
        operationIds: ops, inverse: inverseOp });
      return respond({ done: status === 'true', confirmed: status === 'true' ? true :
        status === 'false' ? false : 'pending', requestKey, preview: summary,
      ...(status !== 'true' ? { warning: 'The result is not verified; inspect Neon before trying again.' } : {}) },
      status === 'false');
    } catch {
      // Fail closed on database or guard errors. Never return provider credentials/errors.
      return deny('The change could not be safely completed or audited. Check Neon before retrying.');
    }
  }
  return Object.freeze({ tool, handler });
}

export const guard = async (decision) => decision === true;
export const gone = () => ({ done: false, code: 'not_found' });
export const safetyNote = (message) => ({ warning: String(message).slice(0, 160) });
