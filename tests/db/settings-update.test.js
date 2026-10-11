import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db;
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());db=createDb(neonShapedQuery());await db.initSchema();});
afterAll(async()=>{await closeIsolatedSchema();});
it('atomically tightens a persisted cap and rejects stale concurrent writes',async()=>{
 expect(await db.updateTightenedSetting({key:'spend.cap_per_day_cents',prior:5000,value:4500})).toBe(true);
 expect(await db.updateTightenedSetting({key:'spend.cap_per_day_cents',prior:5000,value:4000})).toBe(false);
 expect((await db.getSpendPolicy()).perDayCents).toBe(4500);
 await expect(db.updateTightenedSetting({key:'spend.cap_per_day_cents',prior:4500,value:5000}))
  .rejects.toThrow();
});
it('never alters owner-managed protected resources or pricing',async()=>{
 await expect(db.updateTightenedSetting({key:'protected_resources',prior:[],value:[]})).rejects.toThrow();
 await expect(db.updateTightenedSetting({key:'pricing',prior:{},value:{}})).rejects.toThrow();
 const rows=await rawQuery("SELECT key FROM settings WHERE updated_by = 'mcp_owner_guarded'");
 expect(rows.map(x=>x.key)).toEqual(['spend.cap_per_day_cents']);
});
