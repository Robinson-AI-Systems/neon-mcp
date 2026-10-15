import {describe,it,expect} from 'vitest';
import {compileTunePlan,parseExplainJson,summarizeTune} from '../../src/dev/tuning-plan.js';
import {classifySql} from '../../src/neon/sql-guard.js';
const key='rmcp_tune_fixture_abcd12345678';
const input={query:'SELECT * FROM public.widgets WHERE status = $1 LIMIT 100',
 params:['ready'],requestKey:key};
const fake=(ms,scan)=>[{ 'QUERY PLAN':[{
 Plan:{'Node Type':scan?'Seq Scan':'Index Scan','Relation Name':'widgets'},
 'Execution Time':ms,'Planning Time':0.1}]}];
describe('V-4 AST-safe copy-only index tuner',()=>{
 it('builds a valid quoted CREATE INDEX and recommended CONCURRENTLY statement',async()=>{
  const p=await compileTunePlan(input);
  expect(p.columns).toEqual(['status']);
  expect(p.table).toBe('widgets');
  expect(p.createStatements[0]).toContain('ON "public"."widgets" ("status")');
  expect(p.recommendation).toContain('CREATE INDEX CONCURRENTLY');
  expect(p.createStatements[0]).not.toContain('CONCURRENTLY');
  expect((await classifySql(p.createStatements[0])).kind).toBe('ddl');
  expect(p.fingerprint).toBe((await compileTunePlan(input)).fingerprint);
  expect(p.fingerprint).not.toBe((await compileTunePlan({...input,
   params:['other']})).fingerprint);
 });
 it('uses parsed explain timing and returns only measured improvements',async()=>{
  const plan=await compileTunePlan(input);
  const before=parseExplainJson(fake(20,true));
  const after=parseExplainJson(fake(3,false));
  const report=summarizeTune({before,after,plan});
  expect(report).toMatchObject({beforeMs:20,afterMs:3,
   suggestedIndexes:[plan.recommendation]});
  expect(summarizeTune({before,after:{...after,executionMs:30},plan})
   .suggestedIndexes).toEqual([]);
  expect(summarizeTune({before:{...before,seqScans:[]},after,plan})
   .suggestedIndexes).toEqual([]);
 });
 it('rejects multiple statements, DML, procedural select, joins and unsafe identifiers',async()=>{
  for(const query of [
   'SELECT * FROM widgets WHERE id = $1; DROP TABLE widgets',
   'SELECT * FROM widgets JOIN people USING(id) WHERE id = $1',
   'SELECT pg_sleep(4) FROM widgets WHERE id = $1',
   'UPDATE widgets SET status = $1',
   'SELECT * FROM widgets WHERE name = $1 -- injected',
   'SELECT * FROM widgets WHERE status = $1 OR is_admin = TRUE'
  ])await expect(compileTunePlan({...input,query})).rejects.toThrow();
  await expect(compileTunePlan({...input,params:[]})).rejects.toThrow();
  await expect(compileTunePlan({...input,params:['a','b']})).rejects.toThrow();
  await expect(compileTunePlan({...input,params:['private-value']})).resolves.toHaveProperty('table','widgets');
 });
 it('handles up to three AND-bound columns but never emits more than one index',async()=>{
  const p=await compileTunePlan({requestKey:key,
   query:'SELECT id FROM public.widgets WHERE status = $1 AND category_id = $2',
   params:['ready',7]});
  expect(p.columns).toEqual(['status','category_id']);
  expect(p.createStatements).toHaveLength(1);
 });
 it('refuses invalid JSON plans and hidden unbounded node trees',()=>{
  expect(()=>parseExplainJson([])).toThrow();
  expect(()=>parseExplainJson(fake(-1,true))).toThrow();
  const node={'Node Type':'Seq Scan','Relation Name':'widgets'};
  let cur=node;for(let i=0;i<102;i++){cur.Plans=[{'Node Type':'Seq Scan',
   'Relation Name':'widgets'}];cur=cur.Plans[0];}
  expect(()=>parseExplainJson([{'QUERY PLAN':[{Plan:node,
   'Execution Time':1}]}])).toThrow();
 });
});