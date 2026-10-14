import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {SEARCH_SQL,OBJECT_SQL} from '../../src/tools/schema-discovery.js';
let schema;
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 await rawQuery('CREATE TABLE tool_repair_items (repair_id integer PRIMARY KEY)');
 await rawQuery('CREATE VIEW tool_repair_view AS SELECT repair_id FROM tool_repair_items');
 await rawQuery("CREATE TYPE tool_repair_status AS ENUM ('open','closed')");
 await rawQuery('CREATE SEQUENCE tool_repair_sequence');
 await rawQuery('CREATE FUNCTION tool_repair_identity(x integer) RETURNS integer LANGUAGE SQL IMMUTABLE AS $$ SELECT x $$');
 await rawQuery('ALTER TABLE tool_repair_items ENABLE ROW LEVEL SECURITY');
 await rawQuery('CREATE POLICY tool_repair_policy ON tool_repair_items FOR SELECT USING (true)');
});
afterAll(async()=>closeIsolatedSchema());
it('reads actual user tables, matching columns, view, enum, function, sequence and policy',async()=>{
 const found=await rawQuery(SEARCH_SQL,['repair',schema]);
 expect(found.some(x=>x.object_name==='tool_repair_items')).toBe(true);
 expect(found.some(x=>x.object_name==='tool_repair_items.repair_id')).toBe(true);
 for(const [kind,expected] of [['views','tool_repair_view'],
  ['enums','tool_repair_status'],['sequences','tool_repair_sequence'],
  ['policies','tool_repair_policy on tool_repair_items']]){
  expect((await rawQuery(OBJECT_SQL[kind],[schema])).some(x=>x.object_name===expected)).toBe(true);
 }
 expect((await rawQuery(OBJECT_SQL.functions,[schema]))
  .some(x=>x.object_name.includes('tool_repair_identity'))).toBe(true);
});
it('executes hostile search only as a value; never changes source relations',async()=>{
 expect(await rawQuery(SEARCH_SQL,["repair'; DROP TABLE tool_repair_items;--",schema])).toEqual([]);
 expect((await rawQuery(OBJECT_SQL.views,[schema])).length).toBeGreaterThan(0);
});
