import {it,expect} from 'vitest';
import {parse} from 'libpg-query';
import {buildReviewedReindexDDL,runReviewedReindexMutation} from '../../src/neon/sql-run.js';
it('pins concurrent INDEX/TABLE REINDEX with bounded, quoted names',async()=>{
 for(const scope of ['index','table']){
  const sql=buildReviewedReindexDDL({scope,schema:'public',table:'people',index:'code_idx'});
  const ast=(await parse(sql)).stmts[0].stmt;
  expect(ast.ReindexStmt).toBeDefined();
  expect(sql).toMatch(/ CONCURRENTLY /);
  expect(sql).not.toMatch(/DATABASE|SYSTEM|CASCADE/);
 }
 expect(buildReviewedReindexDDL({schema:'pub"lic',index:'odd"name'})).toContain('"odd""name"');
 expect(()=>buildReviewedReindexDDL({schema:'pg_catalog',index:'idx'})).toThrow();
 expect(()=>buildReviewedReindexDDL({scope:'database',schema:'public',index:'idx'})).toThrow();
});
it('uses exact direct target and one outside-transaction bounded DDL',async()=>{
 const calls=[],ctx={db:{getSqlMaintenanceTimeoutMs:async()=>600000},connection:{neonOrg:'org-fake'}};
 const target={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
  expectedEndpointHost:'direct.fake',database:'neondb',role:'owner',pooled:false};
 await runReviewedReindexMutation({ctx,target,schema:'public',table:'people',scope:'table',
  sqlLayer:async(_scope,_target,callback)=>callback({
   query:async text=>{calls.push(text);return {rows:[]};}})});
 expect(calls).toHaveLength(3);
 expect(calls.slice(0,2)).toEqual(['SET lock_timeout = 5000','SET statement_timeout = 600000']);
 expect(calls[2]).toBe('REINDEX TABLE CONCURRENTLY "public"."people"');
 expect(calls.join(' ')).not.toMatch(/BEGIN|CASCADE/);
});
