import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {compilePublicImport,verifyPublicImport} from '../../src/dev/import-plan.js';
import {classifySql} from '../../src/neon/sql-guard.js';

const key='rmcp_import_unit_abcdefghijklmn';
const sample=[
 {sku:'S-1',email:'example1@example.com',price_cents:1100,available:true,launch_on:'2024-01-03'},
 {sku:'S-2',email:'example2@example.com',price_cents:2200,available:false,launch_on:'2024-01-04'}
];
function source(rows=sample){
 const text=JSON.stringify(rows);
 return {kind:'json',host:'raw.githubusercontent.com',text,
  sha256:createHash('sha256').update(text).digest('hex'),
  byteLength:Buffer.byteLength(text)};
}
describe('V-2 guarded public one-table import plan',()=>{
 it('creates a deterministic constrained typed table and parameterized rows',async()=>{
  const p=compilePublicImport({source:source(),requestKey:key});
  expect(p.schema).toMatch(/^rmcp_import_[0-9a-f]{24}$/);
  expect(p.totalRows).toBe(2);
  expect(p.sourceHash).toHaveLength(64);
  expect(p.statements).toHaveLength(3);
  expect(p.expectedAffectedRows).toEqual([0,0,2]);
  expect(p.columns.map(x=>x.type)).toEqual([
   'integer','text','text','integer','boolean','date']);
  expect(p.statements[1]).toContain('UNIQUE');
  expect(p.statements[1]).toContain('CHECK');
  expect(p.statements[2]).toContain('jsonb_array_elements($1::jsonb)');
  expect(JSON.parse(p.params[2][0])).toHaveLength(2);
  for(const sql of p.statements)
   expect(['ddl','write']).toContain((await classifySql(sql)).kind);
  expect(compilePublicImport({source:source(),requestKey:key}))
   .toEqual(p);
  expect(compilePublicImport({source:source([{sku:'DIFFERENT'}]),requestKey:key}).schema)
   .not.toBe(p.schema);
 });
 it('keeps hundreds of rows in at most 20 statements with every JSON bind below 8192',()=>{
  const rows=Array.from({length:500},(_,i)=>({
   sku:'SKU-'+(i+1),price_cents:1000+i,
   active:i%2===0}));
  const p=compilePublicImport({source:source(rows),requestKey:key});
  expect(p.totalRows).toBe(500);
  expect(p.statements.length).toBeLessThanOrEqual(20);
  expect(p.params.slice(2).every(a=>a.length===1&&a[0].length<=8192)).toBe(true);
  expect(p.expectedAffectedRows.slice(2).reduce((a,b)=>a+b,0)).toBe(500);
 });
 it('refuses duplicate constrained values and non-synthetic contacts',()=>{
  expect(()=>compilePublicImport({source:source([
   {email:'same@example.com'},{email:'same@example.com'}]),requestKey:key}))
   .toThrow('unique');
  expect(()=>compilePublicImport({source:source([{price_cents:-1}]),requestKey:key}))
   .toThrow('numeric');
  expect(()=>compilePublicImport({source:source([{email:'real@gmail.com'}]),requestKey:key}))
   .toThrow('example.com');
  expect(()=>compilePublicImport({source:source(),requestKey:'invalid'}))
   .toThrow('stable');
 });
 it('independently compares every column and refuses missing/altered cells',async()=>{
  const p=compilePublicImport({source:source(),requestKey:key});
  const query=async()=>({rows:structuredClone(p.rows)});
  expect(await verifyPublicImport({plan:p,query})).toBe(true);
  const missing=async()=>({rows:p.rows.slice(0,1)});
  expect(await verifyPublicImport({plan:p,query:missing})).toBe(false);
  const changed=async()=>({rows:p.rows.map((row,i)=>i===0?{...row,sku:'NOT-IMPORTED'}:row)});
  expect(await verifyPublicImport({plan:p,query:changed})).toBe(false);
 });
});
