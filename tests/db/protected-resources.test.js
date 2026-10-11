import {beforeAll,afterAll,expect,it} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db;
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();});
afterAll(async()=>{await closeIsolatedSchema();});
it('stores and retrieves only the owner-managed protected list',async()=>{
  expect(await db.getProtectedResources()).toEqual([]);
  const list=[{kind:'other',org:'org-fake',project_id:'prj-fake',label:'Test protected'}];
  await db.saveProtectedResourcesFromSetup(list);
  expect(await db.getProtectedResources()).toEqual(list);
  await db.saveProtectedResourcesFromSetup([]);
  expect(await db.getProtectedResources()).toEqual([]);
  const rows=await rawQuery("SELECT key,updated_by FROM settings WHERE key='protected_resources'");
  expect(rows).toEqual([{key:'protected_resources',updated_by:'owner_setup'}]);
});
