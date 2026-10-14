import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {HEALTH_SQL} from '../../src/tools/health-check.js';
let schema;
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 await rawQuery('CREATE TABLE health_fixture_items (id INTEGER PRIMARY KEY)');
 await rawQuery('INSERT INTO health_fixture_items VALUES (1),(2)');
});
afterAll(async()=>closeIsolatedSchema());
it('queries real database size, transaction age and user-table sizes',async()=>{
 const size=await rawQuery(HEALTH_SQL.database_size);
 expect(Number(size[0].bytes)).toBeGreaterThan(0);
 const xid=await rawQuery(HEALTH_SQL.xid_age);
 expect(Number(xid[0].frozen_xid_age)).toBeGreaterThanOrEqual(0);
 const tables=await rawQuery(HEALTH_SQL.table_sizes);
 expect(tables.some(x=>x.schema_name===schema&&
  x.table_name==='health_fixture_items')).toBe(true);
});
it('reads real activity and cache indicators without changing test rows',async()=>{
 const active=await rawQuery(HEALTH_SQL.connections);
 expect(active.reduce((n,x)=>n+Number(x.session_count),0)).toBeGreaterThan(0);
 expect(await rawQuery(HEALTH_SQL.cache_hit)).toHaveLength(1);
 expect(Array.isArray(await rawQuery(HEALTH_SQL.locks))).toBe(true);
 expect((await rawQuery('SELECT count(*)::int AS n FROM health_fixture_items'))[0].n).toBe(2);
});
