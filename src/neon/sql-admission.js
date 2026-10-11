// B-3d internal bridge from SQL previews/apply to the durable B-4 spending guard.
// D-5 must create this using the authenticated server database; nothing comes from MCP args.
import { createSpendGuard } from './spend.js';

const validOrg = x => typeof x === 'string' && /^[A-Za-z0-9_-]{2,120}$/.test(x);

/**
 * Explicit owner confirmation is required before a temporary preview branch can cost money.
 * SQL execution does not provision capacity, so its *configured monthly increase* is 0;
 * usage-based storage/compute charges are not estimated as zero, nor billed as a purchase.
 * Later $-marked tools must use reserve() with a worst-case price, not this adapter.
 */
export function createSqlAdmissions({ db, previewConfirmed = false } = {}) {
  const guard = createSpendGuard({ db });
  if (typeof db?.reserveSpendCapacity !== 'function')
    throw new TypeError('SQL preview requires atomic spend capacity reservation');
  async function previewAdmission({ orgId, target, estimatedCostCents } = {}) {
    if (!validOrg(orgId) || !target?.projectId || !target?.branchId ||
        previewConfirmed !== true ||
        !Number.isSafeInteger(estimatedCostCents) ||
        estimatedCostCents < 1 || estimatedCostCents > 25) return false;
    return guard.admitPreview({ orgId, estimatedCostCents, confirm: true });
  }
  async function sqlSpendAdmission({ orgId, target, classification, confirm } = {}) {
    if (!validOrg(orgId) || !target?.projectId || !target?.branchId ||
        !Array.isArray(classification) || classification.length < 1 ||
        classification.some(row => !['write','ddl','destructive'].includes(row.kind)))
      return false;
    // The actual SQL is still guarded; B-4 enforces approved owner confirmation/caps.
    const approval = await guard.check({ orgId, confirm,
      estimate: { increaseCents: 0, canApply: true } });
    return approval.allowed === true;
  }
  return Object.freeze({ previewAdmission, sqlSpendAdmission });
}
