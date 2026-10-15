import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {appliedPrismaRows,compileMigrationPreview,splitMigration,
 lockingWarnings,PRISMA_SQL,TABLE_SIZE_SQL} from '../../src/dev/migration-plan.js';
import {classifySql} from '../../src/neon/sql-guard.js';
const key='rmcp_migration_preview_abcdef123456789';
const file=(text)=>({kind:'sql',text,
 sha256:createHash('sha256').update(text).digest('hex')});
const sizes=[{table_name:'widgets',estimated_rows:250000},
 {table_name:'audit_log',estimated_rows:10}];
function input({files=true,changed=false,failed=false,outOfOrder=false}={}){
 const rows=failed?[{migration_name:'20261001_first',finished_at:null,rolled_back_at:null}]:
  [{migration_name:outOfOrder?'20261003_third':'20261001_first',
   finished_at:'2026-10-01T00:00:00Z',rolled_back_at:null}];
 const filesInput=[
  {name:'20261001_first',url:'https://raw.githubusercontent.com/example/public/main/20261001_first.sql'},
  {name:'20261002_second',url:'https://raw.githubusercontent.com/example/public/main/20261002_second.sql'},
  {name:'20261003_third',url:'https://raw.githubusercontent.com/example/public/main/20261003_third.sql'}
 ];
 const texts={
  '20261002_second.sql':'ALTER TABLE public.widgets ADD COLUMN flag boolean',
  '20261003_third.sql':changed?'INSERT INTO public.widgets(id) VALUES (2)':
   'CREATE INDEX idx_widgets_flag ON public.widgets(flag)'
 };
 return {args:files?{schemaName:'public',migrations:filesInput}:
  {schemaName:'public',statements:[texts['20261002_second.sql']]},
  requestKey:key,loadApplied:async()=>rows,loadSizes:async()=>sizes,
  lockWarnRows:100000,fetchFile:async url=>{
   const name=url.split('/').at(-1);
   if(!texts[name])throw Error('Already applied migration must not be fetched');
   return file(texts[name]);
  }};
}
describe('V-3 AST migration planner and pending-order discipline',()=>{
 it('parses only approved SQL roots and refuses unrecognized/procedural/reads',async()=>{
  const list=await splitMigration('CREATE TABLE demo(id integer PRIMARY KEY); '+
   'ALTER TABLE demo ADD COLUMN flag boolean; INSERT INTO demo (id) VALUES (1);');
  expect(list.map(x=>x.root)).toEqual(['CreateStmt','AlterTableStmt','InsertStmt']);
  for(const item of list){
   const classification=await classifySql(item.sql);
   expect(['write','ddl','destructive']).toContain(classification.kind);
   expect(classification.unknownNode).toBe(false);
  }
  for(const sql of ['SELECT * FROM users','GRANT ALL ON widgets TO public',
   'CREATE FUNCTION x() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$',
   'DO $$ BEGIN NULL; END $$','COPY users TO STDOUT','DROP DATABASE neondb']){
   await expect(splitMigration(sql)).rejects.toThrow(/migration preview/);
  }
 });
 it('compares actual Prisma applied names, fetches only pending public files in order',async()=>{
  const p=await compileMigrationPreview(input());
  expect(p.mode).toBe('public-migrations');
  expect(p.alreadyApplied).toEqual(['20261001_first']);
  expect(p.filenames).toEqual(['20261002_second','20261003_third']);
  expect(p.summary.map(x=>x.root)).toEqual(['AlterTableStmt','IndexStmt']);
  expect(p.statements).toHaveLength(2);
  expect(p.warnings).toEqual([{
   statement:1,table:'widgets',estimatedRows:250000,
   reason:'Potential ACCESS EXCLUSIVE lock on a large table'
  }]);
  expect(p.params).toEqual([[],[]]);
  expect(p.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(p.fingerprint).toBe((await compileMigrationPreview(input())).fingerprint);
  expect((await compileMigrationPreview(input({changed:true}))).fingerprint).not.toBe(p.fingerprint);
 });
 it('refuses failing or out-of-order migration history, unknown files and identity drift',async()=>{
  await expect(compileMigrationPreview(input({failed:true}))).rejects.toThrow(/migration preview/);
  await expect(compileMigrationPreview(input({outOfOrder:true}))).rejects.toThrow(/migration preview/);
  const f=input();
  f.args.migrations[0].url='file:///local/sql.sql';
  await expect(compileMigrationPreview(f)).rejects.toThrow();
  const changed=input();
  changed.fetchFile=async()=>({kind:'sql',text:'ALTER TABLE widgets ADD x text',sha256:'0'.repeat(64)});
  await expect(compileMigrationPreview(changed)).rejects.toThrow(/migration preview/);
 });
 it('rejects duplicate/damaged Prisma state and supports explicit rollback as pending',()=>{
  expect(()=>appliedPrismaRows([{
   migration_name:'first',finished_at:null,rolled_back_at:null
  }])).toThrow();
  expect(()=>appliedPrismaRows([{
   migration_name:'first',finished_at:'2026-10-01',rolled_back_at:null
  },{migration_name:'first',finished_at:'2026-10-02',rolled_back_at:null}])).toThrow();
  expect(appliedPrismaRows([{
   migration_name:'first',finished_at:null,rolled_back_at:'2026-10-01'
  }]).size).toBe(0);
 });
 it('emits cautious ACCESS EXCLUSIVE warnings for unknown or large relations',async()=>{
  const s=await splitMigration('ALTER TABLE public.widgets ADD COLUMN flag boolean');
  expect(lockingWarnings(s,[],100000)).toMatchObject([{
   table:'widgets',estimatedRows:null
  }]);
  expect(lockingWarnings(s,sizes,300000)).toEqual([]);
  expect(()=>lockingWarnings(s,sizes,100)).toThrow();
  expect(()=>lockingWarnings(s,[...sizes,sizes[0]])).toThrow();
 });
 it('supports bounded direct SQL while still refusing unsafe nodes and multiple modes',async()=>{
  const p=await compileMigrationPreview(input({files:false}));
  expect(p.mode).toBe('inline');expect(p.statements).toHaveLength(1);
  const f=input({files:false});f.args.migrations=[];
  await expect(compileMigrationPreview(f)).rejects.toThrow();
  const bulk=input({files:false});bulk.args.statements=Array(21).fill('ALTER TABLE widgets ADD a int');
  await expect(compileMigrationPreview(bulk)).rejects.toThrow();
  expect(PRISMA_SQL('public')).toContain('"_prisma_migrations"');
  expect(TABLE_SIZE_SQL).toContain('reltuples');
 });
});