// Approved 2026-10-10 design snapshot; always show source/date alongside estimates.
// Dollars never use floating point at persistence boundaries: rates are integer micro-USD.
export const DEFAULT_PRICING = Object.freeze({
  source: 'https://neon.com/pricing',
  checkedAt: '2026-10-10',
  ratesMicro: Object.freeze({
    launchCuHour: 106000, scaleCuHour: 222000, storageGbMonth: 350000,
    instantRestoreGbMonth: 200000, scheduledSnapshotGbMonth: 90000,
    extraBranchMonth: 1500000, egressGb: 100000
  }),
  included: Object.freeze({ launchBranches: 10, scaleBranches: 25, egressGb: 500 })
});
const plans = new Set(['Free', 'Launch', 'Scale']);
export function validatePricing(pricing) {
  if (!pricing || pricing.source !== 'https://neon.com/pricing' ||
      !/^\d{4}-\d\d-\d\d$/.test(pricing.checkedAt || '') ||
      !pricing.ratesMicro || !pricing.included ||
      Object.entries(DEFAULT_PRICING.ratesMicro).some(([k]) =>
        !Number.isSafeInteger(pricing.ratesMicro[k]) || pricing.ratesMicro[k] < 0) ||
      Object.entries(DEFAULT_PRICING.included).some(([k]) =>
        !Number.isSafeInteger(pricing.included[k]) || pricing.included[k] < 0))
    throw new TypeError('Pricing table is missing a validated source, date or integer rates');
  return pricing;
}
const cents = (micros) => Math.ceil(micros / 10000);
const unknown = (description) => ({ increaseCents: null, estimate: true,
  canApply: false, message: description });
/** Inputs are trusted before/after state gathered from Neon by a write plan. */
export function estimateMonthlyIncrease({ kind, plan, before, after, pricing = DEFAULT_PRICING } = {}) {
  validatePricing(pricing);
  if (!plans.has(plan)) return unknown('Verify the organization plan before estimating spending.');
  if (plan === 'Free') return { increaseCents: null, estimate: true,
    canApply: false, message: 'Free plan has usage/branch/compute limits. Check those limits; no dollar purchase is possible here.' };
  const r = pricing.ratesMicro;
  let microIncrease, estimated = false;
  if (kind === 'compute') {
    if (![before?.maxCu, after?.maxCu].every(x => typeof x === 'number' &&
      Number.isFinite(x) && x >= 0 && x <= 10000))
      return unknown('Current and proposed compute CU maximums are required.');
    const rate = plan === 'Launch' ? r.launchCuHour : r.scaleCuHour;
    // Worst case: max CU all 730 hours, even when scale-to-zero can reduce real use.
    microIncrease = Math.max(0, after.maxCu - before.maxCu) * 730 * rate;
  } else if (kind === 'branch') {
    if (![before?.count, after?.count].every(x => Number.isSafeInteger(x) && x >= 0))
      return unknown('Current and proposed total branch counts are required.');
    const included = plan === 'Launch' ? pricing.included.launchBranches : pricing.included.scaleBranches;
    microIncrease = Math.max(0, after.count - included) * r.extraBranchMonth -
      Math.max(0, before.count - included) * r.extraBranchMonth;
    microIncrease = Math.max(0, microIncrease);
  } else {
    const options = {
      storage: ['storageGbMonth', 'gb'], restore: ['instantRestoreGbMonth', 'gb'],
      snapshot: ['scheduledSnapshotGbMonth', 'gb'], egress: ['egressGb', 'gb']
    };
    const pair = options[kind];
    if (!pair) return unknown('Unsupported price estimator category.');
    const field = pair[1];
    if (![before?.[field], after?.[field]].every(x => typeof x === 'number' &&
      Number.isFinite(x) && x >= 0 && x <= 100000000))
      return unknown('Usage size or history is unknown; show rate and require a verified estimate.');
    const included = kind === 'egress' ? pricing.included.egressGb : 0;
    microIncrease = Math.max(0, after[field] - included) * r[pair[0]] -
      Math.max(0, before[field] - included) * r[pair[0]];
    microIncrease = Math.max(0, microIncrease);
    estimated = kind === 'snapshot' || kind === 'restore';
  }
  if (!Number.isSafeInteger(Math.ceil(microIncrease)) ||
      !Number.isSafeInteger(cents(microIncrease)))
    return unknown('Spending projection is outside the supported integer range.');
  return { increaseCents: cents(microIncrease), estimate: estimated, canApply: true,
    source: pricing.source, priceCheckedAt: pricing.checkedAt };
}
