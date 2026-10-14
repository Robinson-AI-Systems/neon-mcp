import {describe,it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {tools,INDEX_STATS_SQL,INDEX_COLUMNS_SQL,candidateIndexDDL,
 createIndexAdviceHandlers} from '../../src/tools/index-advice.js';
const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'public',tableName:'orders',
 columns:['customer_id']};
const json=x=>JSON.parse(x.content[0].text);
function fixture({foreign=false,scan=130,rows=50000,idx=2,
 leading=false,truncated=false,columns=['customer_id','amount']}={}){
 const calls=[];
 const handler=createIndexAdviceHandlers({
  verifyTarget:async a=>({pid:foreign?'foreign':a.projectId,bid:a.branchId,
   endpointId:a.endpointId,database:a.databaseName,role:a.roleName,
   endpoint:{host:'verified.invalid'}}),
  contextFor:async()=>({trusted:true}),
  runQuery:async x=>{
   calls.push(x);
   const result=x.text===INDEX_STATS_SQL
    ?[{seq_scans:scan,sequential_rows_read:rows,index_scans:idx}]
    :columns.map(column_name=>({column_name,
      is_leading_index_column:leading&&column_name==='customer_id'}));
   return {done:true,truncated,rowCount:result.length,rows:result};
  }});
 return {calls,handler:handler.neon_health_suggest_indexes};
}
describe('D-6 verified non-executing index candidates',()=>{
 it('registers only a bounded read tool with fixed parseable SELECTs',async()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0].name).toBe('neon_health_suggest_indexes');
  expect(tools[0].writes).toBe(false);
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
  for(const sql of [INDEX_STATS_SQL,INDEX_COLUMNS_SQL]){
   expect((await classifySql(sql)).kind).toBe('read');
   expect(sql).toMatch(/LIMIT 201$/);
   expect(sql).not.toMatch(/SELECT\s+\*/i);
  }
 });
 it('only recommends review when verified stats and caller-selected columns justify it',async()=>{
  const f=fixture(),value=json(await f.handler(args,{}));
  expect(value).toMatchObject({done:true,disposition:'review_candidate',
    neverExecuted:true,complete:true});
  expect(value.candidateDDL).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/);
  expect(value.candidateDDL).toContain('ON "public"."orders" ("customer_id")');
  expect(f.calls.map(x=>x.params)).toEqual([['public','orders'],['public','orders']]);
  expect(f.calls.every(x=>x.target.pooled===false&&
   x.target.expectedEndpointHost==='verified.invalid')).toBe(true);
 });
 it('does not recommend a covered or statistically unsupported guess',async()=>{
  for(const [options,status] of [[{leading:true},'existing_leading_index'],
    [{scan:4},'insufficient_scan_evidence']]){
   const f=fixture(options),value=json(await f.handler(args,{}));
   expect(value.disposition).toBe(status);
   expect(value.candidateDDL).toBe(null);
  }
 });
 it('refuses unknown, truncated, invalid or foreign catalogs',async()=>{
  expect(json(await fixture({truncated:true}).handler(args,{})).done).toBe(false);
  expect(json(await fixture({columns:['elsewhere']}).handler(args,{})).code)
   .toBe('column_not_found');
  expect(json(await fixture({scan:null}).handler(args,{})).code)
   .toBe('statistics_unknown');
  const f=fixture({foreign:true});
  await expect(f.handler(args,{})).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  for(const patch of [{schemaName:'pg_catalog'},
   {tableName:'orders";DROP TABLE important;--'},
   {columns:['customer_id','customer_id']},{columns:[]}]){
   const other=fixture();
   await expect(other.handler({...args,...patch},{})).rejects.toThrow();
   expect(other.calls).toHaveLength(0);
  }
 });
 it('quotes identifiers deterministically and caps PostgreSQL name length',()=>{
  const ddl=candidateIndexDDL('safe-name','very_long_table_'.repeat(3),
   ['column-name']);
  expect(ddl).toContain('ON "safe-name"."very_long_table_');
  expect(ddl.match(/IF NOT EXISTS "([^"]+)"/)[1].length).toBeLessThanOrEqual(63);
  expect(candidateIndexDDL('public','orders',['customer_id']))
   .toBe(candidateIndexDDL('public','orders',['customer_id']));
  expect(()=>candidateIndexDDL('public','orders',['x"; DROP'])).toThrow();
 });
});
