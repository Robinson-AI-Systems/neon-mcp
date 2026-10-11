import {beforeAll,afterAll,expect,it} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery}
  from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db;
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();
  await db.saveNeonOrg({orgId:'org-fake',label:'Fake Org'});});
afterAll(async()=>{await closeIsolatedSchema();});
it('requires a pending request and consumes owner approval at most once',async()=>{
  expect(await db.completeProductionEnable({orgId:'org-fake'})).toBe(false);
  expect((await db.getNeonOrg('org-fake')).production_enabled).toBe(false);
  expect(await db.requestProductionEnable({orgId:'org-fake'})).toBe(true);
  expect(await db.getPendingProductionEnable('org-fake')).not.toBeNull();
  const results=await Promise.all([
    db.completeProductionEnable({orgId:'org-fake'}),
    db.completeProductionEnable({orgId:'org-fake'})]);
  expect(results.sort()).toEqual([false,true]);
  expect((await db.getNeonOrg('org-fake')).production_enabled).toBe(true);
  expect(await db.getPendingProductionEnable('org-fake')).toBeNull();
  expect(await db.requestProductionEnable({orgId:'org-fake'})).toBe(false);
});
it('disabling revokes access and a pending request, and expired requests cannot enable',async()=>{
  expect(await db.disableProduction({orgId:'org-fake'})).toBe(true);
  expect((await db.getNeonOrg('org-fake')).production_enabled).toBe(false);
  expect(await db.requestProductionEnable({orgId:'org-fake'})).toBe(true);
  await rawQuery("UPDATE settings SET value = jsonb_build_object('expiresAt', '2000-01-01T00:00:00Z') WHERE key = 'production_intent:org-fake'");
  expect(await db.completeProductionEnable({orgId:'org-fake'})).toBe(false);
  expect((await db.getNeonOrg('org-fake')).production_enabled).toBe(false);
  expect(await db.disableProduction({orgId:'org-fake'})).toBe(true);
  expect(await db.getPendingProductionEnable('org-fake')).toBeNull();
});
