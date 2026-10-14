import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {MIGRATION_CATALOG_SQL,migrationSelect} from '../../src/tools/migration-history.js';
let schema;
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 await rawQuery('CREATE TABLE _prisma_migrations (migration_name text, started_at timestamptz, finished_at timestamptz, rolled_back_at timestamptz)');
 await rawQuery("INSERT INTO _prisma_migrations VALUES ('20261001_initial',now()-interval '1 day',now()-interval '1 day',NULL),('20261002_broken',now(),NULL,NULL)");
 await rawQuery('CREATE TABLE knex_migrations (id integer, name text, migration_time timestamptz)');
 await rawQuery("INSERT INTO knex_migrations VALUES (1,'create_users',now())");
});
afterAll(async()=>closeIsolatedSchema());
it('detects actual Prisma and Knex history on a disposable schema without reading private logs',async()=>{
 const found=await rawQuery(MIGRATION_CATALOG_SQL,[schema]);
 expect(found.filter(x=>x.table_name==='_prisma_migrations').length).toBe(4);
 const prisma=await rawQuery(migrationSelect(schema,'_prisma_migrations'));
 expect(prisma.map(x=>x.status)).toEqual(['failed','applied']);
 expect(prisma[0].name).toBe('20261002_broken');
 const knex=await rawQuery(migrationSelect(schema,'knex_migrations'));
 expect(knex).toMatchObject([{name:'create_users',status:'applied'}]);
 expect((await rawQuery('SELECT count(*)::int AS n FROM _prisma_migrations'))[0].n).toBe(2);
});
