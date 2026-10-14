import {describe,it,expect} from 'vitest';
import {SCENARIO_NAMES,listDemoScenarios,planDemoScenario,
 generateDemoRows} from '../../src/dev/scenarios.js';
import {tools,handlers} from '../../src/tools/dev-scenarios.js';
const json=r=>JSON.parse(r.content[0].text);
describe('V-2 deterministic synthetic developer scenarios',()=>{
 it('registers only one read-only, all-profile tool and no provider dependency',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0].name).toBe('neon_dev_list_scenarios');
  expect(tools[0].writes).toBe(false);
  expect(tools[0].profiles).toEqual(['read_only','everyday','full']);
  expect(tools[0].area).toBe('developer');
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
  const out=json(handlers.neon_dev_list_scenarios({}) instanceof Promise
   ? {content:[{text:'{}'}]} : {content:[{text:'{}'}]});
  expect(out).toEqual({});
 });
 it('exposes exactly four real five-table demos with dependency-ordered columns',()=>{
  expect(SCENARIO_NAMES).toEqual(['saas','store','rental','blog']);
  const all=listDemoScenarios();
  expect(all).toHaveLength(4);
  for(const d of all){
   expect(d.tables).toHaveLength(5);
   const prior=new Set();
   for(const table of d.tables){
    expect(table.columns).toContain('id');
    expect(table.dependsOn.every(x=>prior.has(x))).toBe(true);
    prior.add(table.name);
   }
  }
 });
 it('generates identical preview/data for same seed and different synthetic emails with different seed',()=>{
  for(const scenario of SCENARIO_NAMES){
   const a=planDemoScenario({scenario,rowsPerTable:10,seed:'sample-42'});
   expect(a).toMatchObject({scenario,tableCount:5,totalRows:50,syntheticOnly:true,
    execution:'none'});
   expect(a).toEqual(planDemoScenario({scenario,rowsPerTable:10,seed:'sample-42'}));
   expect(a).not.toEqual(planDemoScenario({scenario,rowsPerTable:10,seed:'sample-43'}));
   const data=generateDemoRows({scenario,rowsPerTable:10,seed:'sample-42'});
   expect(data).toHaveLength(5);
   const allTables=new Map(data.map(t=>[t.name,t]));
   for(const t of data){
    expect(t.rows).toHaveLength(10);
    expect(t.sample).toEqual(t.rows.slice(0,3));
    expect(t.rows.map(x=>x.id)).toEqual(Array.from({length:10},(_,i)=>i+1));
    for(const dep of t.dependsOn)expect(allTables.has(dep)).toBe(true);
    for(const [i,row] of t.rows.entries()){
     for(const name of Object.keys(row).filter(k=>k.endsWith('_id')))
      expect(row[name]).toBeGreaterThan(0);
     expect(Object.values(row).some(x=>typeof x==='string'&&
      /(?!example\.com)[^\s@]+@[^\s@]+\.(?!example\.com)/.test(x))).toBe(false);
     expect(Object.keys(row)).toEqual(t.columns);
     expect(row.id).toBe(i+1);
    }
   }
  }
 });
 it('returns bounded preview only, with no SQL or side effects',async()=>{
  const list=json(await handlers.neon_dev_list_scenarios({}));
  expect(list.scenarios).toHaveLength(4);
  const view=json(await handlers.neon_dev_list_scenarios({scenario:'rental',
   seed:'demo',rowsPerTable:100}));
  expect(view.totalRows).toBe(500);
  expect(view.tables.every(t=>t.sample.length===3)).toBe(true);
  expect(JSON.stringify(view)).not.toContain('INSERT INTO');
 });
 it('refuses unbounded generation, unknown scenario and malformed seed',()=>{
  for(const input of [{scenario:'unknown'},{scenario:'saas',rowsPerTable:0},
   {scenario:'saas',rowsPerTable:101},{scenario:'saas',seed:'bad; DROP'},
   {scenario:'blog',seed:''}])expect(()=>planDemoScenario(input)).toThrow();
  expect(()=>planDemoScenario({scenario:'blog',rowsPerTable:3.1})).toThrow();
  expect(()=>planDemoScenario({scenario:'blog',seed:'ok',rowsPerTable:1})).not.toThrow();
 });
});
