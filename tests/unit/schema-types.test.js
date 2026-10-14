import {describe,it,expect} from 'vitest';
import {stripTypeScriptTypes} from 'node:module';
import {tools,jsonScalarType,generateSchemaSource,createSchemaTypeHandlers}
 from '../../src/tools/schema-types.js';
import {TABLES_SQL,COLUMNS_SQL} from '../../src/tools/schema-reads.js';
const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'public'};
const column=(name,ordinal=1,nullable=false,type='text')=>({
 column_name:name,ordinal_position:ordinal,nullable,data_type:type});
const json=x=>JSON.parse(x.content[0].text);
function fixture({inventory=['orders'],columns=[column('id',1,false,'integer'),
 column('created_at',2,true,'timestamp with time zone')],badIdentity=false,
 truncate=false}={}){
 const calls=[];
 const h=createSchemaTypeHandlers({
  verifyTarget:async a=>({pid:badIdentity?'proj-foreign':a.projectId,
   bid:a.branchId,endpointId:a.endpointId,database:a.databaseName,
   role:a.roleName,endpoint:{host:'fake-endpoint.invalid'}}),
  contextFor:async()=>({authorized:true}),
  runQuery:async x=>{
   calls.push(x);
   const rows=x.text===TABLES_SQL?inventory.map(table_name=>({table_name})):columns;
   return {done:true,rows,rowCount:rows.length,truncated:truncate};
  }
 }).neon_schema_generate_types;
 return {h,calls};
}
describe('D-6 safe generated TypeScript and Zod row models',()=>{
 it('registers an owner-policy read tool without a write contract',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_schema_generate_types']);
  expect(tools[0].writes).toBe(false);
  expect(tools[0].inputSchema.required).toContain('schemaName');
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('maps PostgreSQL JSON scalar representations conservatively',()=>{
  expect(jsonScalarType('integer')).toBe('number');
  expect(jsonScalarType('numeric(12,2)')).toBe('string');
  expect(jsonScalarType('bigint')).toBe('string');
  expect(jsonScalarType('timestamp with time zone')).toBe('string');
  expect(jsonScalarType('text[]')).toBe('string[]');
  expect(jsonScalarType('unknown_enum')).toBe('unknown');
  expect(jsonScalarType('jsonb')).toBe('unknown');
 });
 it('generates syntax-valid interfaces with nullability and escaped property names',()=>{
  const code=generateSchemaSource([{name:'orders',columns:[
   column('order_id'),column('net-price',2,true,'numeric(8,2)'),
   column('metadata',3,false,'jsonb')]}]);
  expect(code).toContain('export interface OrdersRow');
  expect(code).toContain('"net-price": string | null;');
  expect(code).toContain('"metadata": unknown;');
  expect(()=>stripTypeScriptTypes(code)).not.toThrow();
 });
 it('produces usable Zod object definitions with matching nullable validators',()=>{
  const code=generateSchemaSource([{name:'orders',columns:[
   column('id',1,false,'integer'),column('labels',2,true,'text[]')]}],'zod');
  expect(code).toContain('import { z } from "zod";');
  expect(code).toContain('"id": z.number()');
  expect(code).toContain('"labels": z.array(z.string()).nullable()');
  expect(code).toContain('z.infer<typeof OrdersRowSchema>');
 });
 it('queries bound catalog metadata and returns compact complete TypeScript',async()=>{
  const f=fixture(),res=json(await f.h(args,{}));
  expect(res).toMatchObject({done:true,format:'typescript',tableCount:1,complete:true});
  expect(f.calls.map(x=>x.text)).toEqual([TABLES_SQL,COLUMNS_SQL]);
  expect(f.calls.map(x=>x.params)).toEqual([['public'],['public','orders']]);
  expect(f.calls.every(x=>x.target.expectedEndpointHost==='fake-endpoint.invalid'&&
   x.target.pooled===false)).toBe(true);
 });
 it('fails closed on invalid model name, malformed columns and incomplete result',async()=>{
  for(const table of [
   [{name:'dup',columns:[column('id'),column('id',2)]}],
   [{name:'bad',columns:[column('bad\nname')]}],
   [{name:'foo-bar',columns:[column('ok')]},
    {name:'foo_bar',columns:[column('other')]}]
  ])expect(()=>generateSchemaSource(table)).toThrow();
  expect(json(await fixture({truncate:true}).h(args,{})).done).toBe(false);
  const foreign=fixture({badIdentity:true});
  await expect(foreign.h(args,{})).rejects.toThrow();
  expect(foreign.calls).toHaveLength(0);
  const tooMany=fixture({inventory:Array.from({length:21},(_,i)=>'table_'+i)});
  expect(json(await tooMany.h(args,{})).code).toBe('selection_incomplete');
 });
});
