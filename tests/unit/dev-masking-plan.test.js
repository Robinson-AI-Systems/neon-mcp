import {describe,it,expect} from 'vitest';
import {MASK_COLUMNS_SQL,maskCatalog,compileMaskPlan} from '../../src/dev/masking-plan.js';
import {classifySql} from '../../src/neon/sql-guard.js';
const key='rmcp_v4_mask_fixture_abcdef123456789';
const rows=[
 {schema_name:'public',table_name:'customers',column_name:'id',data_type:'int4'},
 {schema_name:'public',table_name:'customers',column_name:'email',data_type:'text'},
 {schema_name:'public',table_name:'customers',column_name:'phone',data_type:'varchar'},
 {schema_name:'public',table_name:'customers',column_name:'amount_cents',data_type:'int4'},
 {schema_name:'public',table_name:'invoices',column_name:'status',data_type:'text'}
];
const rules=[
 {schemaName:'public',tableName:'customers',columnName:'email',preset:'email'},
 {schemaName:'public',tableName:'customers',columnName:'phone',preset:'text'},
 {schemaName:'public',tableName:'invoices',columnName:'status',preset:'text'}
];
const compile=(input={})=>compileMaskPlan({rows,rules,databaseName:'devdb',
 requestKey:key,...input});
describe('V-4 full metadata-only sensitive masking admission',()=>{
 it('uses read-only bounded catalog and maps all sensitive fields to vetted functions',async()=>{
  const shape=await classifySql(MASK_COLUMNS_SQL);
  expect(shape.kind).toBe('read');
  expect(shape.unknownNode).toBe(false);
  expect(maskCatalog(rows)).toHaveLength(5);
  const p=compile();
  expect(p.columnsChecked).toBe(5);
  expect(p.maskedColumns).toBe(3);
  expect(p.tableCount).toBe(2);
  expect(p.rules.map(x=>x.masking_function)).toEqual([
   'anon.fake_email()','anon.random_string(16)','anon.random_string(16)'
  ]);
  expect(p.rules.every(x=>x.database_name==='devdb')).toBe(true);
  expect(p.fingerprint).toBe(compile().fingerprint);
  expect(JSON.stringify(p)).not.toContain('real data');
 });
 it('fails closed if an email column or any other sensitive field is missing',()=>{
  expect(()=>compile({rules:rules.filter(r=>r.columnName!=='email')})).toThrow(/masking policy/);
  expect(()=>compile({rules:rules.slice(0,1)})).toThrow(/masking policy/);
  expect(()=>compile({rules:rules.filter(r=>r.columnName!=='phone'),
   unmasked:[{schemaName:'public',tableName:'customers',columnName:'phone'}]}))
   .toThrow(/masking policy/);
 });
 it('refuses duplicate, mis-scoped, unsupported function or type',()=>{
  expect(()=>compile({rules:[...rules,rules[0]]})).toThrow(/masking policy/);
  expect(()=>compile({rules:[...rules,{...rules[0],schemaName:'other'}]})).toThrow(/masking policy/);
  expect(()=>compile({rules:[...rules,{...rules[0],preset:'unsafe arbitrary SQL'}]}))
   .toThrow(/masking policy/);
  expect(()=>compile({rows:[...rows,{schema_name:'public',
   table_name:'customers',column_name:'payload',data_type:'jsonb'}]})).toThrow(/masking policy/);
  expect(()=>compile({rows:[...rows,rows[0]]})).toThrow(/masking policy/);
  expect(()=>compile({rows:Array(501).fill(rows[0])})).toThrow(/masking policy/);
 });
 it('permits explicit non-sensitive false positive without weakening required masks',()=>{
  const p=compile({unmasked:[{schemaName:'public',tableName:'customers',
   columnName:'amount_cents'}]});
  expect(p.maskedColumns).toBe(3);
  expect(p.fingerprint).not.toBe(compile().fingerprint);
 });
 it('refuses empty or changed mask policy before any provider mutation',()=>{
  expect(()=>compile({rules:[]})).toThrow(/masking policy/);
  expect(()=>compile({rows:[]})).toThrow(/masking policy/);
  expect(()=>compile({databaseName:'bad-name'})).toThrow(/masking policy/);
 });
});