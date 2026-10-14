import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {SCHEMAS_SQL,TABLES_SQL,COLUMNS_SQL,INDEXES_SQL,CONSTRAINTS_SQL,POLICIES_SQL,
 EXTENSIONS_SQL} from '../../src/tools/schema-reads.js';
let schema;
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 await rawQuery('CREATE TABLE sample_schema_test (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)');
 await rawQuery('CREATE INDEX schema_amount_idx ON sample_schema_test (amount)');
 await rawQuery('ALTER TABLE sample_schema_test ENABLE ROW LEVEL SECURITY');
 await rawQuery("CREATE POLICY schema_read_only ON sample_schema_test FOR SELECT USING (true)");
});
afterAll(async()=>{await closeIsolatedSchema();});
it('queries real PostgreSQL schemas, table sizes, columns, indexes and policies without touching rows',async()=>{
 const namespaces=await rawQuery(SCHEMAS_SQL);
 expect(namespaces.some(x=>x.schema_name===schema)).toBe(true);
 const tables=await rawQuery(TABLES_SQL,[schema]);
 const table=tables.find(x=>x.table_name==='sample_schema_test');
 expect(table).toMatchObject({rls_enabled:true,rls_forced:false});
 expect(Number(table.total_bytes)).toBeGreaterThanOrEqual(0);
 const cols=await rawQuery(COLUMNS_SQL,[schema,'sample_schema_test']);
 expect(cols.map(x=>x.column_name)).toEqual(['id','amount']);
 const indexes=await rawQuery(INDEXES_SQL,[schema,'sample_schema_test']);
 expect(indexes.some(x=>x.index_name==='schema_amount_idx')).toBe(true);
 const constraints=await rawQuery(CONSTRAINTS_SQL,[schema,'sample_schema_test']);
 expect(constraints.some(x=>x.constraint_type==='p')).toBe(true);
 const policies=await rawQuery(POLICIES_SQL,[schema,'sample_schema_test']);
 expect(policies.some(x=>x.policy_name==='schema_read_only')).toBe(true);
 const available=await rawQuery(EXTENSIONS_SQL);
 expect(Array.isArray(available)).toBe(true);
});
it('treats hostile identifier text as a bound value and never executes it',async()=>{
 const hostile="public'; DROP TABLE sample_schema_test; --";
 const rows=await rawQuery(TABLES_SQL,[hostile]);
 expect(rows).toEqual([]);
 expect((await rawQuery(COLUMNS_SQL,[schema,'sample_schema_test'])).length).toBe(2);
});
