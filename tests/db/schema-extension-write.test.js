import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery}
 from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {EXTENSIONS_SQL} from '../../src/tools/schema-reads.js';
import {buildReviewedExtensionDDL} from '../../src/neon/sql-run.js';
let schema;
beforeAll(async()=>{schema=await openIsolatedSchema(requireLocalDatabaseUrl());});
afterAll(async()=>closeIsolatedSchema());
it('verifies real disposable PostgreSQL extension versions without mutations',async()=>{
 const rows=await rawQuery(EXTENSIONS_SQL);
 expect(rows.some(x=>x.extension_name==='hstore'&&
  typeof x.default_version==='string')).toBe(true);
 expect(buildReviewedExtensionDDL('hstore')).toBe(
  'CREATE EXTENSION "hstore" WITH SCHEMA "public"');
 expect((await rawQuery('SELECT count(*)::int AS n FROM pg_catalog.pg_extension'))[0].n)
  .toBeGreaterThanOrEqual(1);
 expect(schema).toBeTruthy();
});
