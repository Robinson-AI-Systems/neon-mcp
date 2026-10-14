import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {registry} from '../../src/tools/index.js';
import {checkBudgets,estimateTokens,evaluateRegistryBudgets,verifyDefaultFixture} from '../../scripts/check-budgets.mjs';
const catalog=readFileSync('docs/TOOL-CATALOG.md','utf8');
const read={name:'neon_safe_read',description:'Show a safe result',writes:false,
 profiles:['read_only'],inputSchema:{type:'object',properties:{}}};
describe('C-2 exact BPE budgets and catalog parity',()=>{
 it('uses a pinned BPE tokenizer, not the old character-over-four estimator',()=>{
  const sample={text:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};
  expect(estimateTokens(sample)).toBeGreaterThan(0);
  expect(estimateTokens(sample)).not.toBe(Math.ceil(JSON.stringify(sample).length/4));
 });
 it('rejects a planted 161-character description',()=>{
  const result=checkBudgets([{...read,description:'x'.repeat(161)}]);
  expect(result.some(x=>x.includes('161 > 160'))).toBe(true);
 });
 it('rejects a schema exceeding 1500 tokens and huge listings',()=>{
  const big={...read,inputSchema:{type:'object',properties:{
   payload:{type:'string',description:Array.from({length:6000},(_,i)=>'field-'+i).join(',')}
  }}};
  expect(checkBudgets([big]).join(' ')).toMatch(/schema.*>= 1500/);
  const repeated=Array.from({length:2000},(_,i)=>({...read,name:'neon_read_'+i}));
  expect(checkBudgets(repeated).join(' ')).toMatch(/catalog ~\d+ tokens > 20000/);
 });
 it('verifies production profile counts and catalog rows against source registry',()=>{
  const report=evaluateRegistryBudgets(registry,catalog);
  expect(report.failures).toEqual([]);
  expect(report.compact).toBeLessThan(5000);
  expect(report.everyday).toBeLessThan(20000);
  const mismatched=catalog.replace(/(`read_only` )(\d+)/,(_m,prefix,count)=>prefix+(Number(count)+1));
  expect(evaluateRegistryBudgets(registry,mismatched).failures.join(' '))
   .toContain('count '+(report.counts.read_only+1)+' != '+report.counts.read_only);
  expect(evaluateRegistryBudgets(registry,'outdated catalog').failures.join(' ')).toMatch(/missing implemented profile totals/);
 });
 it('budgets the approved everyday wire catalog while validating full-only schemas',()=>{
  const fullOnly=Array.from({length:600},(_,i)=>({...read,name:'neon_owner_'+i,
   profiles:['full'],inputSchema:{type:'object',properties:{value:{type:'string'}}}}));
  const source={tools:fullOnly,handlers:{}};
  expect(estimateTokens(fullOnly)).toBeGreaterThan(20000);
  expect(evaluateRegistryBudgets(source).failures).toEqual([]);
  const everyday=fullOnly.map(t=>({...t,profiles:['everyday']}));
  expect(evaluateRegistryBudgets({tools:everyday}).failures.join(' ')).toMatch(/everyday catalog/);
  fullOnly[0]={...fullOnly[0],description:'x'.repeat(161)};
  expect(evaluateRegistryBudgets(source).failures.join(' ')).toMatch(/161 > 160/);
 });
 it('routes 100 realistic records into same-connection secret-free handle within 8 KB',async()=>{
  const result=await verifyDefaultFixture();
  expect(result.ok).toBe(true);
  expect(result.bytes).toBeLessThanOrEqual(8192);
  expect(result.handle).toBe(true);
  expect(result.stored).toBe(1);
  expect(result.secretFree).toBe(true);
 });
});
