import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {compileMigrationPreview,PRISMA_SQL,TABLE_SIZE_SQL} from '../../src/dev/migration-plan.js';
let schema,child;
const key='rmcp_db_preview_abcdef123456789';
const q=n=>'"'+n+'"';
const source={name:'20261015_add_archive',
 url:'https://raw.githubusercontent.com/public/synthetic/main/20261015_add_archive.sql'};
const file=text=>({kind:'sql',text,
 sha256:createHash('sha256').update(text).digest('hex')});
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 child=schema+'_scratch';
 await rawQuery('CREATE SCHEMA '+q(child));
 await rawQuery('CREATE TABLE '+q(schema)+'.widgets (id integer PRIMARY KEY, label text NOT NULL)');
 await rawQuery('INSERT INTO '+q(schema)+'.widgets SELECT n, $1 FROM generate_series(1,2500) AS n',
  ['unchanged-example']);
 await rawQuery('ANALYZE '+q(schema)+'.widgets');
 await rawQuery('CREATE TABLE '+q(schema)+'._prisma_migrations ('+
  'migration_name text PRIMARY KEY,started_at timestamptz,'+
  'finished_at timestamptz,rolled_back_at timestamptz)');
 await rawQuery('INSERT INTO '+q(schema)+'._prisma_migrations VALUES '+
  "('20261001_initial',now()-interval '1 day',now()-interval '1 day',NULL)");
 await rawQuery('CREATE TABLE '+q(child)+'.widgets AS TABLE '+q(schema)+'.widgets');
});
afterAll(async()=>{
 try{if(child)await rawQuery('DROP SCHEMA IF EXISTS '+q(child)+' CASCADE');}
 finally{await closeIsolatedSchema();}
});
describe('V-3 real PostgreSQL migration fixture: parent stays unchanged',()=>{
 it('reads current Prisma history and emits warning for large referenced table',async()=>{
  const history=await rawQuery(PRISMA_SQL(schema));
  expect(history).toHaveLength(1);
  expect(history[0].migration_name).toBe('20261001_initial');
  const sizes=await rawQuery(TABLE_SIZE_SQL,[schema]);
  expect(sizes).toContainEqual({table_name:'widgets',estimated_rows:'2500'});
  const text='ALTER TABLE '+q(child)+'.widgets ADD COLUMN archived boolean';
  const plan=await compileMigrationPreview({
   args:{schemaName:schema,migrations:[
    {name:'20261001_initial',
     url:'https://raw.githubusercontent.com/public/synthetic/main/20261001_initial.sql'},
    source]},
   requestKey:key,lockWarnRows:1000,
   loadApplied:async()=>rawQuery(PRISMA_SQL(schema)),
   loadSizes:async()=>rawQuery(TABLE_SIZE_SQL,[schema]),
   fetchFile:async url=>{
    expect(url).toBe(source.url);
    return file(text);
   }
  });
  expect(plan.alreadyApplied).toEqual(['20261001_initial']);
  expect(plan.statements).toEqual([text]);
  expect(plan.warnings).toMatchObject([{
   statement:1,table:'widgets',estimatedRows:2500
  }]);
  const original=await rawQuery('SELECT count(*)::int AS n FROM '+q(schema)+'.widgets');
  const before=await rawQuery("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='widgets' ORDER BY ordinal_position",[schema]);
  // Local disposable schema simulates the B-3c child database; no target SQL is issued.
  for(const sql of plan.statements)await rawQuery(sql);
  const after=await rawQuery("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='widgets' ORDER BY ordinal_position",[schema]);
  expect(after).toEqual(before);
  expect(after.map(x=>x.column_name)).toEqual(['id','label']);
  expect(await rawQuery('SELECT count(*)::int AS n FROM '+q(schema)+'.widgets')).toEqual(original);
  expect(await rawQuery('SELECT count(*)::int AS n FROM '+q(child)+'.widgets'))
   .toEqual(original);
  const altered=await rawQuery("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='widgets' ORDER BY ordinal_position",[child]);
  expect(altered.map(x=>x.column_name)).toEqual(['id','label','archived']);
 });
 it('refuses incomplete Prisma migration before fetching or mutating any table',async()=>{
  await rawQuery('INSERT INTO '+q(schema)+'._prisma_migrations VALUES '+
   "('20261015_unfinished',now(),NULL,NULL)");
  let fetched=false;
  await expect(compileMigrationPreview({
   args:{schemaName:schema,migrations:[source]},
   requestKey:key,
   loadApplied:async()=>rawQuery(PRISMA_SQL(schema)),
   loadSizes:async()=>rawQuery(TABLE_SIZE_SQL,[schema]),
   fetchFile:async()=>{fetched=true;return file('ALTER TABLE widgets ADD COLUMN v int');}
  })).rejects.toThrow(/migration preview/);
  expect(fetched).toBe(false);
  const before=await rawQuery('SELECT count(*)::int AS n FROM '+q(schema)+'.widgets');
  expect(before).toEqual([{n:2500}]);
 });
});