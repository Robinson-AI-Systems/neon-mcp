import {describe,it,expect} from 'vitest';
import {runPublicSqlExplain} from '../../src/neon/sql-run.js';
import {runAuthorizedSqlRead} from '../../src/neon/sql-read.js';

const ids={org:'org-fake-neon',project:'proj-fake-target',branch:'br-fake-dev'};
function fixture({protectedSelf=false,production=false,allowProductionReads=true}={}){
 const statements=[];
 const ctx={connection:{neonOrg:ids.org,projectScope:ids.project,mode:'preview'},
  db:{getProtectedResources:async()=>[],
   getSqlReadPolicy:async()=>({productionReads:allowProductionReads,maxRows:200})},
  selfProject:{org:ids.org,project_id:protectedSelf?ids.project:'proj-fake-self'},
  getBranch:async()=>({id:ids.branch,default:production,protected:production})};
 const target={projectId:ids.project,branchId:ids.branch,database:'neondb',role:'owner'};
 const sqlLayer=async(_scope,_target,work)=>work({query:async(text,values)=>{
  statements.push({text,values});
  if(text.startsWith('EXPLAIN '))return {rows:[{'QUERY PLAN':'Index Scan using fake_idx'}]};
  return {rows:[]};
 }});
 return {ctx,target,sqlLayer,statements};
}
describe('D-5 SQL EXPLAIN DML plan is never an executed mutation',()=>{
 it('plans UPDATE in a READ ONLY transaction with ANALYZE FALSE and binding',async()=>{
  const f=fixture();
  const x=await runPublicSqlExplain({...f,text:'UPDATE invoices SET paid = true WHERE id = $1',
   params:[7],analyze:false});
  expect(x).toMatchObject({done:true,analyzed:false,nonExecutingWritePlan:true});
  expect(f.statements.map(s=>s.text)).toEqual([
   'BEGIN READ ONLY','SET LOCAL statement_timeout = 15000',
   'SET LOCAL lock_timeout = 5000',
   'EXPLAIN (FORMAT TEXT, ANALYZE FALSE) UPDATE invoices SET paid = true WHERE id = $1',
   'COMMIT']);
  expect(f.statements[3].values).toEqual([7]);
 });
 it('plans bounded DELETE with no DELETE command issued',async()=>{
  const f=fixture(),x=await runPublicSqlExplain({...f,
   text:'DELETE FROM invoices WHERE id = 7'});
  expect(x.nonExecutingWritePlan).toBe(true);
  expect(f.statements.some(s=>s.text.startsWith('DELETE '))).toBe(false);
 });
 it('refuses ANALYZE of a write before connecting',async()=>{
  const f=fixture();
  const x=await runPublicSqlExplain({...f,
   text:'DELETE FROM invoices WHERE id=7',analyze:true});
  expect(x).toMatchObject({done:false,code:'analyze_write_refused'});
  expect(f.statements).toHaveLength(0);
 });
 it('refuses dangerous SQL and multiple statements before connecting',async()=>{
  for(const text of ['DELETE FROM invoices; DROP TABLE invoices',
   'CALL mutate()', 'EXPLAIN (ANALYZE TRUE) DELETE FROM invoices']){
   const f=fixture(),x=await runPublicSqlExplain({...f,text});
   expect(x.done).toBe(false);
   expect(f.statements).toHaveLength(0);
  }
 });
 it('requires the exact fixed EXPLAIN prefix even through the private guard',async()=>{
  const f=fixture();
  for(const text of ['DELETE FROM invoices WHERE id=7',
   'EXPLAIN (ANALYZE TRUE) DELETE FROM invoices WHERE id=7',
   'EXPLAIN (FORMAT TEXT, ANALYZE FALSE) DROP TABLE invoices']){
   const result=await runAuthorizedSqlRead({ctx:f.ctx,target:f.target,text,
    sqlLayer:f.sqlLayer,nonExecutingDmlPlan:true});
   expect(result.done).toBe(false);
   expect(f.statements).toHaveLength(0);
  }
 });
 it('preserves own-database and production read-policy refusal without opening SQL',async()=>{
  for(const opts of [{protectedSelf:true},{production:true,allowProductionReads:false}]){
   const f=fixture(opts);
   const x=await runPublicSqlExplain({...f,text:'UPDATE invoices SET paid=true WHERE id=7'});
   expect(x.done).toBe(false);
   expect(f.statements).toHaveLength(0);
  }
 });
 it('keeps normal SELECT EXPLAIN ANALYZE read-only',async()=>{
  const f=fixture(),x=await runPublicSqlExplain({...f,text:'SELECT 1',analyze:true});
  expect(x).toMatchObject({done:true,analyzed:true,nonExecutingWritePlan:false});
  expect(f.statements.map(s=>s.text).join(' ')).toContain('EXPLAIN (FORMAT TEXT, ANALYZE TRUE) SELECT 1');
 });
});
