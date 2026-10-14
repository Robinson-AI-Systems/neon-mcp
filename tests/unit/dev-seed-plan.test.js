import {describe,it,expect,vi} from 'vitest';
import {compileDemoSeed,verifyDemoSeed} from '../../src/dev/seed-plan.js';
import {SCENARIO_NAMES} from '../../src/dev/scenarios.js';
import {classifySql} from '../../src/neon/sql-guard.js';

const key='rmcp_demo_seed_abcdef12345678';
describe('V-2 audited relational synthetic seed planning',()=>{
 it('generates each complete five-table dependency-ordered SQL transaction without caller SQL',async()=>{
  for(const scenario of SCENARIO_NAMES){
   const p=compileDemoSeed({scenario,requestKey:key,seed:'repeat',rowsPerTable:20});
   expect(p.schema).toMatch(/^rmcp_demo_[0-9a-f]{24}$/);
   expect(p.totalRows).toBe(100);
   expect(p.statements).toHaveLength(11);
   expect(p.params).toHaveLength(11);
   expect(p.expectedAffectedRows).toEqual([...Array(6).fill(0),...Array(5).fill(20)]);
   expect(p.statements[0]).toBe('CREATE SCHEMA "'+p.schema+'"');
   for(const [i,t] of p.tables.entries()){
    expect(p.statements[i+1]).toContain('CREATE TABLE "'+p.schema+'"."'+t.name+'"');
    for(const parent of t.dependsOn)
     expect(p.statements[i+1]).toContain('REFERENCES "'+p.schema+'"."'+parent+'"');
    expect(p.statements[i+6]).toContain('INSERT INTO "'+p.schema+'"."'+t.name+'"');
    expect(p.params[i+6]).toHaveLength(20*t.columns.length);
    for(const row of t.rows){
     expect(row.id).toBeGreaterThanOrEqual(1);
     for(const value of Object.values(row))
      if(typeof value==='string'&&value.includes('@'))
       expect(value.endsWith('@example.com')).toBe(true);
    }
   }
   for(const sql of p.statements){
    const kind=(await classifySql(sql)).kind;
    expect(['ddl','write']).toContain(kind);
   }
  }
 });
 it('binds an idempotency key to the exact scenario, seed and count',()=>{
  const x={scenario:'rental',requestKey:key,seed:'fixed',rowsPerTable:8};
  expect(compileDemoSeed(x)).toEqual(compileDemoSeed(x));
  expect(compileDemoSeed({...x,seed:'other'}).schema).not.toBe(compileDemoSeed(x).schema);
  expect(compileDemoSeed({...x,scenario:'blog'}).schema).not.toBe(compileDemoSeed(x).schema);
  expect(compileDemoSeed({...x,rowsPerTable:9}).schema).not.toBe(compileDemoSeed(x).schema);
 });
 it('refuses malformed payloads and all raw or excessive seed input',()=>{
  for(const bad of [{scenario:'foreign'},{scenario:'saas',rowsPerTable:0},
   {scenario:'saas',rowsPerTable:21},{scenario:'rental',seed:'bad;DROP'},
   {scenario:'blog',seed:'bad@example.com'}])
   expect(()=>compileDemoSeed({...bad,requestKey:key})).toThrow();
  expect(()=>compileDemoSeed({scenario:'saas',requestKey:'not-valid'})).toThrow();
 });
 it('independently compares all rows and detects missing, extra or changed cells',async()=>{
  const p=compileDemoSeed({scenario:'store',requestKey:key,rowsPerTable:3});
  const query=vi.fn(async text=>{
   const table=p.tables.find(x=>text.includes('"'+x.name+'"'));
   return {rows:structuredClone(table.rows)};
  });
  expect(await verifyDemoSeed({plan:p,query})).toBe(true);
  expect(query).toHaveBeenCalledTimes(5);
  const missing=async text=>{
   const table=p.tables.find(x=>text.includes('"'+x.name+'"'));
   return {rows:table.rows.slice(0,-1)};
  };
  expect(await verifyDemoSeed({plan:p,query:missing})).toBe(false);
  const tampered=async text=>{
   const table=p.tables.find(x=>text.includes('"'+x.name+'"'));
   const rows=structuredClone(table.rows);
   rows[0].id=999;return {rows};
  };
  expect(await verifyDemoSeed({plan:p,query:tampered})).toBe(false);
 });
});
