import { describe, it, expect } from 'vitest';
import { createSqlAdmissions } from '../../src/neon/sql-admission.js';
import { DEFAULT_PRICING } from '../../src/neon/pricing.js';

const orgId = 'org-fake-sql-admission';
const target = { projectId: 'prj-fake', branchId: 'br-fake' };
const classification = [{ kind: 'write' }];
function fixture({ confirmed = false, perChangeCents = 2500, perDayCents = 5000,
  failPolicy = false } = {}) {
  let reserved = 0, calls = 0;
  const db = {
    getPricing: async () => DEFAULT_PRICING,
    getSpendPolicy: async () => failPolicy ? null : { perChangeCents, perDayCents },
    reserveSpendCapacity: async ({ increaseCents, dailyCapCents }) => {
      calls++;
      if (reserved + increaseCents > dailyCapCents) return false;
      reserved += increaseCents;
      return true;
    }
  };
  return { admission: createSqlAdmissions({ db, previewConfirmed: confirmed }),
    state: () => ({ reserved, calls }) };
}
describe('B-3d SQL-specific B-4 admission adapter', () => {
  it('previews require server-supplied owner confirmation, fixed small cost and atomic daily limit', async () => {
    const f = fixture();
    expect(await f.admission.previewAdmission({ orgId, target, estimatedCostCents: 1 })).toBe(false);
    expect(f.state()).toEqual({ reserved: 0, calls: 0 });
    const g = fixture({ confirmed: true, perDayCents: 2 });
    expect(await g.admission.previewAdmission({ orgId, target, estimatedCostCents: 1 })).toBe(true);
    expect(await g.admission.previewAdmission({ orgId, target, estimatedCostCents: 1 })).toBe(true);
    expect(await g.admission.previewAdmission({ orgId, target, estimatedCostCents: 1 })).toBe(false);
    expect(g.state()).toEqual({ reserved: 2, calls: 3 });
  });
  it('denies missing or unusable owner caps, too-large preview costs and unknown resource', async () => {
    const bad = fixture({ confirmed: true, failPolicy: true });
    expect(await bad.admission.previewAdmission({ orgId, target, estimatedCostCents: 1 })).toBe(false);
    expect(await bad.admission.sqlSpendAdmission({ orgId, target, classification, confirm: true })).toBe(false);
    const g = fixture({ confirmed: true, perChangeCents: 0 });
    expect(await g.admission.previewAdmission({ orgId, target, estimatedCostCents: 1 })).toBe(false);
    expect(await g.admission.previewAdmission({ orgId, target, estimatedCostCents: 100 })).toBe(false);
    expect(await g.admission.previewAdmission({ orgId, estimatedCostCents: 1 })).toBe(false);
  });
  it('apply requires B-4 policy plus explicit confirmation, rejects invalid classes and missing scope', async () => {
    const f = fixture();
    const args = { orgId, target, classification };
    expect(await f.admission.sqlSpendAdmission(args)).toBe(false);
    expect(await f.admission.sqlSpendAdmission({ ...args, confirm: true })).toBe(true);
    expect(await f.admission.sqlSpendAdmission({ ...args, classification: [{ kind: 'read' }], confirm: true })).toBe(false);
    expect(await f.admission.sqlSpendAdmission({ ...args, orgId: '', confirm: true })).toBe(false);
    expect(f.state().reserved).toBe(0);
  });
  it('fails to construct with an incomplete database rather than bypassing spend safety', () => {
    expect(() => createSqlAdmissions({ db: {} })).toThrow();
    expect(() => createSqlAdmissions()).toThrow();
  });
});
