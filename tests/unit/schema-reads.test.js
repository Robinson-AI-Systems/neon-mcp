import {describe,it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {tools,createSchemaReadHandlers,SCHEMAS_SQL,TABLES_SQL,COLUMNS_SQL,
 INDEXES_SQL,CONSTRAINTS_SQL,POLICIES_SQL,EXTENSIONS_SQL}
 from '../../src/tools/schema-reads.js';
const target={projectId:'proj-fake-source',branchId:'br-fake-dev',
 endpointId:'ep-fake-endpoint',databaseName:'neondb',roleName:'owner'};
const json=result=>JSON.parse(result.content[0].text);
function fixture({result,identity=null}={}){
 const calls=[];
 const verifyTarget=async a=>identity??{pid:a.projectId,bid:a.branchId,
   endpointId:a.endpointId,database:a.databaseName,role:a.roleName,
   endpoint:{host:'ep-fake.neon.tech'}};
 const handler=createSchemaReadHandlers({verifyTarget,
  contextFor:async()=>({owner:true}),
  runQuery:async args=>{calls.push(args);return result??{
   done:true,rows:[{column_name:'id'}],rowCount:1,truncated:false};}});
 return {calls,handler};
}
describe('D-6 verified schema explorer',()=>{
 it('offers four bound, owner-policy read-only tools',async()=>{
  expect(tools.map(x=>x.name)).toEqual([
   'neon_schema_list_schemas','neon_schema_list_tables',
   'neon_schema_describe_table','neon_schema_list_extensions']);
  for(const t of tools){
   expect(t.writes).toBe(false);expect(t.inputSchema.additionalProperties).toBe(false);
   expect(t.inputSchema.required).toContain('endpointId');
  }
  for(const sql of [SCHEMAS_SQL,TABLES_SQL,COLUMNS_SQL,INDEXES_SQL,
    CONSTRAINTS_SQL,POLICIES_SQL,EXTENSIONS_SQL]){
   expect((await classifySql(sql)).kind).toBe('read');
   expect(sql).toMatch(/LIMIT 201$/);
  }
 });
 it('binds exact verified direct endpoint and a positional schema name',async()=>{
  const f=fixture();const x=json(await f.handler.neon_schema_list_tables({
   ...target,schemaName:'public'},{}));
  expect(x.done).toBe(true);expect(x.complete).toBe(true);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]).toMatchObject({target:{
   projectId:target.projectId,endpointId:target.endpointId,
   database:'neondb',role:'owner',pooled:false,
   expectedEndpointHost:'ep-fake.neon.tech'},
   text:TABLES_SQL,params:['public']});
 });
 it('returns four independently bounded table metadata sections without application rows',async()=>{
  const f=fixture();const out=json(await f.handler.neon_schema_describe_table({
   ...target,schemaName:'public',tableName:'invoices'},{}));
  expect(out).toMatchObject({done:true,complete:true});
  expect(f.calls.map(x=>x.text)).toEqual([
   COLUMNS_SQL,INDEXES_SQL,CONSTRAINTS_SQL,POLICIES_SQL]);
  expect(f.calls.every(x=>JSON.stringify(x.params)==='["public","invoices"]')).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/query_text|password|table_rows/);
 });
 it('marks truncation or insufficient catalog data incomplete, never fully inspected',async()=>{
  const f=fixture({result:{done:true,rows:[{column_name:'id'}],
   rowCount:1,truncated:true}});
  const x=json(await f.handler.neon_schema_describe_table({
   ...target,schemaName:'public',tableName:'invoices'},{}));
  expect(x.done).toBe(true);expect(x.complete).toBe(false);
  const unavailable=fixture({result:{done:false,code:'protected_resource'}});
  const y=json(await unavailable.handler.neon_schema_describe_table({
   ...target,schemaName:'public',tableName:'invoices'},{}));
  expect(y).toMatchObject({done:false,complete:false});
 });
 it('refuses forged provider identity and unsuitable names before SQL',async()=>{
  const f=fixture({identity:{pid:'proj-foreign'}});
  await expect(f.handler.neon_schema_list_schemas(target,{})).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  const v=fixture();
  await expect(v.handler.neon_schema_describe_table({...target,
   schemaName:'public;DROP TABLE x',tableName:'invoices'},{})).rejects.toThrow();
  expect(v.calls).toHaveLength(0);
 });
});
