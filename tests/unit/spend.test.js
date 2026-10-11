import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICING, estimateMonthlyIncrease, validatePricing }
  from '../../src/neon/pricing.js';
import { createSpendGuard } from '../../src/neon/spend.js';

describe('B-4 stored micro-dollar pricing and worst-case costs', () => {
  it('hand-checks 2 additional Launch CU, 730h at $0.106/CU-hour = $154.76', () => {
    expect(estimateMonthlyIncrease({ kind: 'compute', plan: 'Launch',
      before: { maxCu: 2 }, after: { maxCu: 4 } })).toMatchObject({
      increaseCents: 15476, estimate: false, canApply: true,
      priceCheckedAt: '2026-10-10' });
    expect(estimateMonthlyIncrease({ kind: 'compute', plan: 'Scale',
      before: { maxCu: 2 }, after: { maxCu: 4 } }).increaseCents).toBe(32412);
  });
  it('counts extra branches beyond Launch 10 and Scale 25', () => {
    expect(estimateMonthlyIncrease({ kind: 'branch', plan: 'Launch',
      before: { count: 10 }, after: { count: 11 } }).increaseCents).toBe(150);
    expect(estimateMonthlyIncrease({ kind: 'branch', plan: 'Scale',
      before: { count: 24 }, after: { count: 26 } }).increaseCents).toBe(150);
    expect(estimateMonthlyIncrease({ kind: 'branch', plan: 'Launch',
      before: { count: 2 }, after: { count: 3 } }).increaseCents).toBe(0);
  });
  it('shows Free plan limits and blocks unknown sizes and rates', () => {
    expect(estimateMonthlyIncrease({ kind: 'compute', plan: 'Free',
      before: { maxCu: 1 }, after: { maxCu: 2 } })).toMatchObject({ canApply: false, increaseCents: null });
    expect(estimateMonthlyIncrease({ kind: 'snapshot', plan: 'Launch',
      before: { gb: 1 }, after: {} })).toMatchObject({ canApply: false, estimate: true });
    expect(estimateMonthlyIncrease({ kind: 'snapshot', plan: 'Launch',
      before: { gb: 1 }, after: { gb: 2 } })).toMatchObject({ increaseCents: 9, estimate: true });
    expect(() => validatePricing({ ...DEFAULT_PRICING, checkedAt: 'unknown' })).toThrow();
  });
});

describe('B-4 confirmation and provider-neutral spend guard', () => {
  function fixture() {
    let daily = 0, claimed = false, released = 0;
    const db = {
      getPricing: async () => DEFAULT_PRICING,
      getSpendPolicy: async () => ({ perChangeCents: 2500, perDayCents: 5000 }),
      reserveSpendCapacity: async ({ increaseCents, dailyCapCents }) => {
        if (daily + increaseCents > dailyCapCents) return false;
        daily += increaseCents; return true;
      },
      releaseSpendCapacity: async ({ increaseCents }) => {
        released += 1; daily -= increaseCents;
      },
      reserveWrite: async () => {
        if (claimed) return { created: false }; claimed = true;
        return { created: true, id: 22 };
      }
    };
    return { db, guard: createSpendGuard({ db }), state: () => ({ daily, released }) };
  }
  const estimate = { increaseCents: 2000, canApply: true, estimate: false };
  it('does not grant without confirm, a trustworthy estimate or within per-change cap', async () => {
    const f = fixture();
    expect((await f.guard.check({ orgId: 'org-fake', estimate })).code).toBe('needs_confirmation');
    expect((await f.guard.check({ orgId: 'org-fake',
      estimate: { increaseCents: 2501, canApply: true }, confirm: true })).code).toBe('per_change_cap');
    expect((await f.guard.check({ orgId: 'org-fake',
      estimate: { increaseCents: null, canApply: false }, confirm: true })).code).toBe('unverified_price');
    expect(await f.guard.admitPreview({ orgId: 'org-fake', estimatedCostCents: 1 })).toBe(false);
    expect(await f.guard.admitPreview({ orgId: 'org-fake', estimatedCostCents: 1, confirm: true })).toBe(true);
  });
  it('reserves daily allowance before audit and denies a duplicate without doubling cost', async () => {
    const f = fixture(), write = { orgId: 'org-fake', tool: 'neon_fake_spend',
      mode: 'preview', target: 'fake-target', summary: 'Fake compute change' };
    const args = { orgId: 'org-fake', estimate, confirm: true,
      requestKey: 'rmcp_spend_fakekey123', write };
    expect(await f.guard.reserve(args)).toMatchObject({ allowed: true, claimId: 22 });
    expect((await f.guard.reserve(args)).code).toBe('duplicate_request');
    expect(f.state()).toEqual({ daily: 2000, released: 1 });
  });
  it('counts repeated preview charges against the atomic daily cap', async () => {
    const f = fixture();
    expect(await f.guard.admitPreview({ orgId: 'org-fake', estimatedCostCents: 2000,
      confirm: true })).toBe(true);
    expect(await f.guard.admitPreview({ orgId: 'org-fake', estimatedCostCents: 2000,
      confirm: true })).toBe(true);
    expect(await f.guard.admitPreview({ orgId: 'org-fake', estimatedCostCents: 2000,
      confirm: true })).toBe(false);
    expect(f.state().daily).toBe(4000);
  });
  it('returns a source-dated estimate from stored pricing', async () => {
    const f = fixture();
    expect(await f.guard.price({ kind: 'branch', plan: 'Launch',
      before: { count: 10 }, after: { count: 11 } })).toMatchObject({
      increaseCents: 150, canApply: true });
  });
});
