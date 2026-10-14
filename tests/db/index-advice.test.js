import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery}
 from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {INDEX_STATS_SQL,INDEX_COLUMNS_SQL,candidateIndexDDL}
 from '../../src/tools/index-advice.js';
let schema;
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 await rawQuery('CREATE TABLE advice_orders (id integer PRIMARY KEY, customer_id integer, status text)');
 await rawQuery('CREATE INDEX advice_customer_idx ON advice_orders(customer_id)');
 await rawQuery("INSERT INTO advice_orders VALUES (1,7,'pending'),(2,8,'paid')");
});
afterAll(async()=>closeIsolatedSchema());
it('observes actual PostgreSQL stats and independently detects index-leading columns',async()=>{
 const stats=await rawQuery(INDEX_STATS_SQL,[schema,'advice_orders']);
 const columns=await rawQuery(INDEX_COLUMNS_SQL,[schema,'advice_orders']);
 expect(stats).toHaveLength(1);
 expect(Number(stats[0].seq_scans)).toBeGreaterThanOrEqual(0);
 expect(columns.map(c=>c.column_name)).toEqual(['id','customer_id','status']);
 expect(columns.find(c=>c.column_name==='customer_id').is_leading_index_column)
  .toBe(true);
 expect(columns.find(c=>c.column_name==='status').is_leading_index_column)
  .toBe(false);
 expect(candidateIndexDDL(schema,'advice_orders',['status']))
  .toContain('CREATE INDEX CONCURRENTLY');
});
it('never executes DDL or reads application rows during fixed catalog observations',async()=>{
 expect(await rawQuery(INDEX_STATS_SQL,[schema,'absent_table'])).toEqual([]);
 expect(await rawQuery(INDEX_COLUMNS_SQL,[schema,'absent_table'])).toEqual([]);
 const rows=await rawQuery('SELECT count(*)::int AS n FROM advice_orders');
 expect(rows[0].n).toBe(2);
});
