import {describe,it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {tools,MIGRATION_CATALOG_SQL,migrationSelect,MIGRATION_KINDS,
 createMigrationHistoryHandlers} from '../../src/tools/migration-history.js';
const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'app',
 expected:['20261001_initial','20261002_users']};
const json=x=>JSON.parse(x.content[0].text);
const catalog=[...MIGRATION_KINDS._prisma_migrations.columns].map(column_name=>({
 schema_name:'app',table_name:'_prisma_migrations',column_name}));
function fixture({foreign=false,incomplete=false,columns=catalog,rows=[
 {name:'20261001_initial',status:'applied',observed_at:'2026-10-01'},
 {name:'20261002_users',status:'failed',observed_at:'2026-10-02'}]}={}){
 const calls=[],h=createMigrationHistoryHandlers({
  verifyTarget:async a=>({pid:foreign?'proj-other':a.projectId,
   bid:a.branchId,endpointId:a.endpointId,database:a.databaseName,
   role:a.roleName,endpoint:{host:'verified.invalid'}}),
  contextFor:async()=>({}),
  runQuery:async x=>{calls.push(x);const data=x.text===MIGRATION_CATALOG_SQL?columns:rows;
   return {done:true,rows:data,rowCount:data.length,truncated:incomplete};}
 }).neon_schema_list_migrations;
 return {calls,h};
}
describe('D-9 migration history inspection',()=>{
 it('registers one read-only tool and fixed catalog SELECT',async()=>{
  expect(tools[0].name).toBe('neon_schema_list_migrations');
  expect(tools[0].writes).toBe(false);
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
  expect((await classifySql(MIGRATION_CATALOG_SQL)).kind).toBe('read');
  expect(MIGRATION_CATALOG_SQL).toMatch(/LIMIT 201$/);
  for(const name of Object.keys(MIGRATION_KINDS)){
   const query=migrationSelect('app',name);
   expect((await classifySql(query)).kind).toBe('read');
   expect(query).toMatch(/LIMIT 201$/);
   expect(query).not.toMatch(/\blogs\b/);
  }
 });
 it('returns applied and failed Prisma history with independently bound target',async()=>{
  const f=fixture(),out=json(await f.h(args,{}));
  expect(out).toMatchObject({done:true,complete:true,sourceCount:1,anyFailed:true});
  expect(out.sources[0].migrations.map(x=>x.status)).toEqual(['applied','failed']);
  expect(out.sources[0].missingExpected).toEqual([]);
  expect(f.calls).toHaveLength(2);
  expect(f.calls[0].params).toEqual(['app']);
  expect(f.calls.every(x=>x.target.expectedEndpointHost==='verified.invalid'&&
   x.target.pooled===false)).toBe(true);
 });
 it('shows missing expected names only for comparable formats',async()=>{
  const f=fixture({rows:[{name:'20261001_initial',status:'applied',observed_at:null}]});
  const result=json(await f.h(args,{}));
  expect(result.sources[0].missingExpected).toEqual(['20261002_users']);
  const drizzle=[...MIGRATION_KINDS.__drizzle_migrations.columns]
   .map(column_name=>({schema_name:'app',table_name:'__drizzle_migrations',column_name}));
  const d=json(await fixture({columns:drizzle,rows:[{
   name:'4',status:'applied',observed_at:'1690000000000'}]}).h(args,{}));
  expect(d.sources[0].missingExpected).toBe(null);
  expect(d.sources[0].expectedNamesComparable).toBe(false);
 });
 it('refuses incomplete history, unrecognized columns and forged identity',async()=>{
  expect(json(await fixture({incomplete:true}).h(args,{})).done).toBe(false);
  expect(json(await fixture({columns:catalog.slice(0,-1)}).h(args,{}))
   .code).toBe('unsupported_migration_columns');
  const f=fixture({foreign:true});
  await expect(f.h(args,{})).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
 });
 it('rejects hostile selector and uses quoted static migration-table names',async()=>{
  const f=fixture();
  await expect(f.h({...args,schemaName:'app";DROP TABLE users;--'},{}))
   .rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect(migrationSelect('my-schema','_prisma_migrations'))
   .toContain('FROM "my-schema"."_prisma_migrations"');
  expect(()=>migrationSelect('app','users')).toThrow();
 });
});
