import {describe,it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {tools,KINDS,SEARCH_SQL,OBJECT_SQL,createSchemaDiscoveryHandlers}
 from '../../src/tools/schema-discovery.js';
const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'reader'};
const json=x=>JSON.parse(x.content[0].text);
function fixture({response={done:true,rows:[],rowCount:0,truncated:false},
 wrong=false}={}){
 const calls=[],handlers=createSchemaDiscoveryHandlers({
  verifyTarget:async a=>({pid:wrong?'proj-foreign':a.projectId,bid:a.branchId,
   endpointId:a.endpointId,database:a.databaseName,role:a.roleName,
   endpoint:{host:'ep-neon.example.test'}}),
  contextFor:async()=>({trusted:true}),
  runQuery:async x=>{calls.push(x);return response}
 });
 return {calls,handlers};
}
describe('D-6 fixed SQL catalog search and objects',()=>{
 it('has two read-only tools and valid fixed PostgreSQL AST plans',async()=>{
  expect(tools.map(x=>x.name)).toEqual(['neon_schema_search','neon_schema_list_objects']);
  expect(KINDS).toHaveLength(8);
  for(const t of tools)expect(t).toMatchObject({writes:false,
   inputSchema:{additionalProperties:false}});
  for(const text of [SEARCH_SQL,...Object.values(OBJECT_SQL)]){
   expect((await classifySql(text)).kind).toBe('read');
   expect(text).toMatch(/LIMIT 201$/);
  }
 });
 it('binds all caller text; never interpolates a hostile search',async()=>{
  const f=fixture(),term="repair';DROP TABLE repairs;--";
  const out=json(await f.handlers.neon_schema_search({...args,term,schemaName:'public'},{}));
  expect(out.complete).toBe(true);
  expect(f.calls[0]).toMatchObject({text:SEARCH_SQL,params:[term,'public'],
   target:{expectedEndpointHost:'ep-neon.example.test',pooled:false}});
 });
 it('maps each requested object type to one fixed SQL statement',async()=>{
  const f=fixture();
  for(const kind of KINDS)expect(json(await f.handlers.neon_schema_list_objects({
   ...args,kind},{})).done).toBe(true);
  expect(f.calls.map(x=>x.text)).toEqual(KINDS.map(k=>OBJECT_SQL[k]));
 });
 it('refuses invalid identity/kind/schema and reports incomplete reads explicitly',async()=>{
  const f=fixture();
  for(const a of [{...args,kind:'sql'},
   {...args,kind:'publications',schemaName:'public'},
   {...args,kind:'functions',schemaName:'public;drop'}]){
   await expect(f.handlers.neon_schema_list_objects(a,{})).rejects.toThrow();
  }
  expect(f.calls).toHaveLength(0);
  await expect(fixture({wrong:true}).handlers.neon_schema_search({
   ...args,term:'repair'},{})).rejects.toThrow();
  const bad=fixture({response:{done:true,rows:[],rowCount:0,truncated:true}});
  expect(json(await bad.handlers.neon_schema_search({...args,term:'repair'},{})).complete).toBe(false);
 });
});
