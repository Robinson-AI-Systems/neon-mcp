import {beforeAll,afterAll,it,expect} from 'vitest';
import {stripTypeScriptTypes} from 'node:module';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {TABLES_SQL,COLUMNS_SQL} from '../../src/tools/schema-reads.js';
import {generateSchemaSource} from '../../src/tools/schema-types.js';
let schema;
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 await rawQuery('CREATE TABLE generated_orders (id integer PRIMARY KEY, amount numeric(10,2), paid boolean NOT NULL)');
 await rawQuery('INSERT INTO generated_orders VALUES (1, 12.50, true)');
});
afterAll(async()=>closeIsolatedSchema());
it('generates parsable TypeScript from actual PostgreSQL column metadata',async()=>{
 const tables=await rawQuery(TABLES_SQL,[schema]);
 expect(tables.some(x=>x.table_name==='generated_orders')).toBe(true);
 const columns=await rawQuery(COLUMNS_SQL,[schema,'generated_orders']);
 expect(columns.map(x=>x.column_name)).toEqual(['id','amount','paid']);
 const code=generateSchemaSource([{name:'generated_orders',columns}]);
 expect(code).toContain('export interface GeneratedOrdersRow');
 expect(code).toContain('"amount": string | null');
 expect(code).toContain('"paid": boolean;');
 expect(()=>stripTypeScriptTypes(code)).not.toThrow();
 expect((await rawQuery('SELECT count(*)::int AS n FROM generated_orders'))[0].n).toBe(1);
});
it('builds distinct Zod validators from the same provider-catalog evidence',async()=>{
 const cols=await rawQuery(COLUMNS_SQL,[schema,'generated_orders']);
 const source=generateSchemaSource([{name:'generated_orders',columns:cols}],'zod');
 expect(source).toContain('"id": z.number()');
 expect(source).toContain('"amount": z.string().nullable()');
 expect(source).toContain('"paid": z.boolean()');
});
