import {describe,it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {tools,KEY_CONSTRAINTS_SQL,renderStructuralDdl,createSchemaDdlHandlers}
 from '../../src/tools/schema-ddl.js';
import {TABLES_SQL,COLUMNS_SQL} from '../../src/tools/schema-reads.js';
const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'public'};
const json=x=>JSON.parse(x.content[0].text);
const cols=[{column_name:'id',ordinal_position:1,data_type:'integer',
 nullable:false,identity_mode:'',generated_mode:''},
 {column_name:'full_name',ordinal_position:2,data_type:'text',
 nullable:true,identity_mode:'',generated_mode:''}];
function fixture({incomplete=false,foreign=false,rows=[{table_name:'people',relation_kind:'r'}]}={}){
 const calls=[];
 const handlers=createSchemaDdlHandlers({
  verifyTarget:async a=>({pid:foreign?'proj-other':a.projectId,bid:a.branchId,
   endpointId:a.endpointId,database:a.databaseName,role:a.roleName,
   endpoint:{host:'exact.fake'}}),contextFor:async()=>({}),
  runQuery:async x=>{calls.push(x);const vals=x.text===TABLES_SQL?rows:
    x.text===COLUMNS_SQL?cols:[{constraint_name:'people_pkey',
     constraint_sql:'PRIMARY KEY (id)'}];
   return {done:true,truncated:incomplete,rows:vals,rowCount:vals.length};}
 });
 return {calls,h:handlers.neon_schema_get_ddl};
}
describe('D-6 schema structural DDL inspection',()=>{
 it('advertises nonmutating bounded input and parses constant catalog SQL',async()=>{
  expect(tools).toHaveLength(1);expect(tools[0].writes).toBe(false);
  expect(tools[0].inputSchema.required).toContain('schemaName');
  expect((await classifySql(KEY_CONSTRAINTS_SQL)).kind).toBe('read');
  expect(KEY_CONSTRAINTS_SQL).toMatch(/LIMIT 201$/);
 });
 it('renders quoted DDL with verified key constraints and explicit omissions',async()=>{
  const f=fixture(),out=json(await f.h(args,{}));
  expect(out).toMatchObject({done:true,complete:true,executableMigration:false});
  expect(out.tables[0].sql).toContain('CREATE TABLE "public"."people"');
  expect(out.tables[0].sql).toContain('CONSTRAINT "people_pkey" PRIMARY KEY (id)');
  expect(out.omitted).toContain('column defaults');
  expect(f.calls.map(x=>x.text)).toEqual([TABLES_SQL,COLUMNS_SQL,KEY_CONSTRAINTS_SQL]);
  expect(f.calls.every(x=>x.target.expectedEndpointHost==='exact.fake'&&
   x.target.pooled===false)).toBe(true);
 });
 it('escapes odd catalog identifiers without allowing caller-injected SQL',()=>{
  expect(renderStructuralDdl('public','odd-table',[{...cols[0],column_name:'bad"name'}]))
   .toContain('"bad""name" integer NOT NULL');
  expect(()=>renderStructuralDdl('public','safe',[{...cols[0],data_type:'text; DROP TABLE users'}]))
   .not.toThrow(); // Catalog type is provider-derived; never executed by this tool.
  expect(()=>renderStructuralDdl('public','safe',[{...cols[0],column_name:'line\nfeed'}]))
   .toThrow();
 });
 it('fails closed on incomplete catalogs, identity mismatch and partitioned tables',async()=>{
  expect(json(await fixture({incomplete:true}).h(args,{})).done).toBe(false);
  const bad=fixture({foreign:true});
  await expect(bad.h(args,{})).rejects.toThrow();
  expect(bad.calls).toHaveLength(0);
  expect(json(await fixture({rows:[{table_name:'people',relation_kind:'p'}]}).h(args,{}))
   .code).toBe('partitioned_table_unsupported');
  const h=fixture();
  await expect(h.h({...args,schemaName:'pg_catalog'},{})).rejects.toThrow();
  expect(h.calls).toHaveLength(0);
 });
});
