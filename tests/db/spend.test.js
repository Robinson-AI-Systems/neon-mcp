import { beforeAll, afterAll, it, expect } from 'vitest';
import pg from 'pg';
import { createDb } from '../../src/db.js';
import { createSpendGuard } from '../../src/neon/spend.js';
import { openIsolatedSchema, closeIsolatedSchema, neonShapedQuery, rawQuery }
  from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';

let db, schema;
const orgId = 'org-fake-budget';
beforeAll(async () => {
  schema = await openIsolatedSchema(requireLocalDatabaseUrl());
  db = createDb(neonShapedQuery());
  await db.initSchema();
  await db.initSchema();
});
afterAll(async () => { await closeIsolatedSchema(); });

it('seeds approved owner caps and dated rate table idempotently', async () => {
  expect(await db.getSpendPolicy()).toEqual({ perChangeCents: 2500, perDayCents: 5000 });
  const prices = await db.getPricing();
  expect(prices).toMatchObject({ checkedAt: '2026-10-10', source: 'https://neon.com/pricing' });
  expect(prices.ratesMicro.launchCuHour).toBe(106000);
  await rawQuery("UPDATE settings SET value = '1000'::jsonb WHERE key = 'spend.cap_per_change_cents'");
  await db.initSchema();
  expect((await db.getSpendPolicy()).perChangeCents).toBe(1000);
});
it('atomic daily cap admits only 8 of 12 concurrent $6 increases', async () => {
  const clients = await Promise.all(Array.from({ length: 12 }, async () => {
    const c = new pg.Client({ connectionString: requireLocalDatabaseUrl() });
    await c.connect(); await c.query('SET search_path TO "' + schema + '"');
    return c;
  }));
  try {
    const results = await Promise.all(clients.map(async c => {
      const tagged = (strings, ...values) => {
        let stmt = strings[0];
        for (let i = 0; i < values.length; i++) stmt += '$' + (i + 1) + strings[i + 1];
        return c.query(stmt, values).then(r => r.rows);
      };
      return createDb(tagged).reserveSpendCapacity({ orgId, increaseCents: 600, dailyCapCents: 5000 });
    }));
    expect(results.filter(Boolean)).toHaveLength(8);
    expect(results.filter(x => !x)).toHaveLength(4);
    const used = await rawQuery("SELECT count FROM rate_limits WHERE key = $1", ['spend_daily:' + orgId]);
    expect(used[0].count).toBe(4800);
  } finally { await Promise.all(clients.map(c => c.end())); }
});
it('guard requires confirmation, records a single claim, no second provider write', async () => {
  const guard = createSpendGuard({ db });
  const result = await guard.reserve({ orgId: 'org-fake-write', confirm: true,
    estimate: { increaseCents: 500, canApply: true },
    requestKey: 'rmcp_spend_testwrite012', write: {
      orgId: 'org-fake-write', tool: 'neon_compute_resize', target: 'fake-endpoint',
      summary: 'Fake $5/month worst-case resize', mode: 'preview' } });
  // Prior test changed cap to 1000, so $5 is still admissible.
  expect(result).toMatchObject({ allowed: true });
  const rows = await rawQuery('SELECT spend_month_cents, request_key, confirmed FROM change_log WHERE neon_org = $1',
    ['org-fake-write']);
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].spend_month_cents)).toBe(500);
  expect(rows[0].confirmed).toBe('pending');
});
it('changing rates requires confirmation and leaves a safe audit row', async () => {
  const prices = await db.getPricing();
  await expect(db.savePricingFromOwnerSetup({ pricing: prices })).rejects.toThrow(/confirmation/);
  await expect(db.savePricingFromOwnerSetup({ pricing: { ...prices, ratesMicro: { ...prices.ratesMicro, launchCuHour: -1 } }, confirm: true })).rejects.toThrow(/Pricing table/);
  await db.savePricingFromOwnerSetup({ pricing: prices, confirm: true });
  const rows = await rawQuery("SELECT tool, summary FROM change_log WHERE tool = 'neon_pricing_update'");
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toMatch(/postgresql:|napi_|password/i);
});
