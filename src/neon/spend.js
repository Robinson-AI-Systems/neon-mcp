// B-4 fail-closed policy and durable per-org/day spend admission.
// No purchase, plan change, live Neon call or public financial write tool.
import { DEFAULT_PRICING, estimateMonthlyIncrease } from './pricing.js';
const deny = (code, message, additional = {}) => ({
  allowed: false, code, message, ...additional
});
const safeCents = value => Number.isSafeInteger(value) && value >= 0 && value <= 2000000000;
export function createSpendGuard({ db } = {}) {
  if (typeof db?.getSpendPolicy !== 'function' ||
      typeof db?.getPricing !== 'function')
    throw new TypeError('Spending guard requires durable policy and pricing');
  async function price({ kind, plan, before, after }) {
    try {
      const pricing = await db.getPricing();
      if (!pricing) return { increaseCents: null, estimate: true, canApply: false };
      return estimateMonthlyIncrease({ kind, plan, before, after, pricing });
    } catch {
      return { increaseCents: null, estimate: true, canApply: false };
    }
  }
  async function check({ orgId, estimate, confirm = false } = {}) {
    if (!orgId || !safeCents(estimate?.increaseCents) || estimate.canApply !== true)
      return deny('unverified_price', 'A reliable source-dated dollar estimate is required.');
    let policy;
    try { policy = await db.getSpendPolicy(); } catch { /* fail closed */ }
    if (!policy || !safeCents(policy.perChangeCents) || !safeCents(policy.perDayCents))
      return deny('policy_unavailable', 'The owner spending caps are unavailable.');
    if (estimate.increaseCents > policy.perChangeCents)
      return deny('per_change_cap', 'Estimated monthly increase exceeds the owner per-change cap.', {
        increaseCents: estimate.increaseCents, limitCents: policy.perChangeCents
      });
    if (confirm !== true)
      return deny('needs_confirmation', 'Review the dollar estimate and explicitly confirm.', {
        increaseCents: estimate.increaseCents, limitCents: policy.perChangeCents
      });
    return { allowed: true, increaseCents: estimate.increaseCents,
      perChangeCapCents: policy.perChangeCents, perDayCapCents: policy.perDayCents };
  }
  /** Atomically count cost *before* the external write. No allowance means no write. */
  async function reserve({ orgId, estimate, confirm, requestKey, write } = {}) {
    const checked = await check({ orgId, estimate, confirm });
    if (!checked.allowed) return checked;
    if (typeof db.reserveSpendCapacity !== 'function' ||
        typeof db.reserveWrite !== 'function' ||
        typeof db.releaseSpendCapacity !== 'function' ||
        !/^rmcp_[a-z0-9_]{5,128}$/.test(requestKey || '') ||
        !write || write.orgId !== orgId)
      return deny('audit_unavailable', 'Durable spending reservation is unavailable.');
    try {
      const granted = await db.reserveSpendCapacity({
        orgId, increaseCents: checked.increaseCents, dailyCapCents: checked.perDayCapCents
      });
      if (!granted) return deny('daily_cap',
        'Today\'s reserved spending increases would exceed the owner daily cap.', {
          increaseCents: checked.increaseCents, limitCents: checked.perDayCapCents
        });
      const claim = await db.reserveWrite({ ...write, orgId, requestKey,
        spendCents: checked.increaseCents });
      if (!claim?.created) {
        // Known duplicate reservation releases only this second capacity claim.
        await db.releaseSpendCapacity({ orgId, increaseCents: checked.increaseCents });
        return deny('duplicate_request', 'Existing request key already claimed; no second write may be sent.');
      }
      return { allowed: true, claimId: claim.id,
        increaseCents: checked.increaseCents, reservedToday: true };
    } catch {
      // Uncertain DB result: capacity remains conservatively reserved (never undercount).
      return deny('reservation_uncertain', 'Spending reservation could not be verified; do not retry a write automatically.');
    }
  }
  /** Temporary preview branches need explicit owner-confirmed policy, never an absent default. */
  async function admitPreview({ orgId, estimatedCostCents = 1, confirm = false } = {}) {
    const estimate = { increaseCents: estimatedCostCents, canApply: true };
    const decision = await check({ orgId, estimate, confirm });
    if (!decision.allowed || typeof db.reserveSpendCapacity !== 'function') return false;
    try {
      // Previews themselves may incur Neon charges. Count them atomically too.
      return await db.reserveSpendCapacity({ orgId, increaseCents: decision.increaseCents,
        dailyCapCents: decision.perDayCapCents }) === true;
    } catch { return false; }
  }
  return Object.freeze({ price, check, reserve, admitPreview,
    defaultPricing: DEFAULT_PRICING });
}
