import {it,expect} from 'vitest';
import {parse} from 'libpg-query';
import {safeExtensionNames,buildReviewedExtensionDDL,
 runReviewedExtensionMutation} from '../../src/neon/sql-run.js';

it('limits extension DDL to six reviewed names and parser-pinned shapes',async()=>{
 expect(safeExtensionNames).toEqual(['citext','pg_trgm','unaccent',
  'hstore','btree_gin','btree_gist']);
 for(const name of safeExtensionNames){
  expect((await parse(buildReviewedExtensionDDL(name))).stmts[0].stmt)
   .toHaveProperty('CreateExtensionStmt');
  expect((await parse(buildReviewedExtensionDDL(name,true))).stmts[0].stmt)
   .toHaveProperty('AlterExtensionStmt');
 }
 for(const name of ['plpython3u','pg_stat_statements',
  'x"; DROP TABLE users; --'])
  expect(()=>buildReviewedExtensionDDL(name)).toThrow();
});
it('executes exactly one internal DDL in a bounded transaction',async()=>{
 const calls=[];
 const result=await runReviewedExtensionMutation({
  ctx:{db:{},connection:{neonOrg:'org-fake',projectScope:'proj-fake'}},
  target:{projectId:'proj-fake',branchId:'br-fake',
   endpointId:'ep-fake',database:'neondb',role:'owner',
   expectedEndpointHost:'direct.invalid',pooled:false},
  name:'citext',sqlLayer:async(_scope,_target,cb)=>cb({
   query:async q=>{calls.push(q);return {rows:[]};}})});
 expect(result).toEqual({issued:true});
 expect(calls).toEqual(['BEGIN','SET LOCAL lock_timeout = 5000',
  'SET LOCAL statement_timeout = 15000',
  'CREATE EXTENSION "citext" WITH SCHEMA "public"','COMMIT']);
});
