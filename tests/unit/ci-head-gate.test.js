import {describe,it,expect} from 'vitest';
import {summarizeExactHeadRuns} from '../../scripts/ci-head-gate.mjs';
const sha='a'.repeat(40);
function payload(changes={}){
 return {check_runs:['check (lint)','unit (fake Neon)','db (throwaway Postgres 17)','ci']
  .map(name=>({name,head_sha:sha,status:'completed',conclusion:'success',
   ...changes[name]}))};
}
describe('one-shot exact-head CI summary for REST/Actions fallback',()=>{
 it('requires precisely check, unit, db and aggregate ci for the same head',()=>{
  expect(summarizeExactHeadRuns(payload(),sha)).toMatchObject({
   state:'success',exitCode:0});
  expect(summarizeExactHeadRuns({check_runs:[]},sha).state).toBe('unverified');
  expect(summarizeExactHeadRuns(payload(),'bad').state).toBe('unverified');
 });
 it('never treats a pending or failed job as green',()=>{
  expect(summarizeExactHeadRuns(payload({'db (throwaway Postgres 17)':{
   status:'in_progress',conclusion:null}}),sha)).toMatchObject({
   state:'pending',exitCode:2});
  expect(summarizeExactHeadRuns(payload({'unit (fake Neon)':{
   conclusion:'failure'}}),sha)).toMatchObject({
   state:'failed',exitCode:1});
 });
 it('rejects cross-head results and missing or duplicate required jobs',()=>{
  expect(summarizeExactHeadRuns(payload({'ci':{head_sha:'b'.repeat(40)}}),sha).state)
   .toBe('unverified');
  const missing=payload();
  missing.check_runs.pop();
  expect(summarizeExactHeadRuns(missing,sha).state).toBe('unverified');
  const duplicate=payload();
  duplicate.check_runs.push({...duplicate.check_runs[0]});
  expect(summarizeExactHeadRuns(duplicate,sha).state).toBe('unverified');
 });
});
