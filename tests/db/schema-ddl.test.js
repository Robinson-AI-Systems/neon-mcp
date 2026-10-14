import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {TABLES_SQL,COLUMNS_SQL} from '../../src/tools/schema-reads.js';
import {KEY_CONSTRAINTS_SQL,renderStructuralDdl} from '../../src/tools/schema-ddl.js';
let schema;
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 await rawQuery('CREATE TABLE ddl_customers (id integer PRIMARY KEY, code text UNIQUE, balance numeric(10,2) NOT NULL)');
 await rawQuery("INSERT INTO ddl_customers VALUES (1,'x',0)");
});
afterAll(async()=>closeIsolatedSchema());
it('inspects actual PostgreSQL table, primary and unique DDL without reading or changing rows',async()=>{
 const tables=await rawQuery(TABLES_SQL,[schema]);
 expect(tables.some(x=>x.table_name==='ddl_customers'&&x.relation_kind==='r')).toBe(true);
 const columns=await rawQuery(COLUMNS_SQL,[schema,'ddl_customers']);
 const constraints=await rawQuery(KEY_CONSTRAINTS_SQL,[schema,'ddl_customers']);
 expect(constraints.length).toBe(2);
 const sql=renderStructuralDdl(schema,'ddl_customers',columns,constraints);
 expect(sql).toContain('PRIMARY KEY (id)');
 expect(sql).toContain('UNIQUE (code)');
 expect(sql).toContain('"balance" numeric(10,2) NOT NULL');
 expect((await rawQuery('SELECT count(*)::int AS n FROM ddl_customers'))[0].n).toBe(1);
});
