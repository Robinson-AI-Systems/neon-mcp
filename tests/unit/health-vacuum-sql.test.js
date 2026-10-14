import {it,expect} from 'vitest';
import {parse} from 'libpg-query';
import {buildReviewedVacuumDDL,runReviewedVacuumMutation} from '../../src/neon/sql-run.js';
it('constructs one bounded VACUUM ANALYZE AST with quoted identifiers',async()=>{
 const ddl=buildReviewedVacuumDDL({schema:'public',table:'people'});
 expect(ddl).toBe('VACUUM (ANALYZE) "public"."people"');
 expect((await parse(ddl)).stmts[0].stmt.VacuumStmt).toBeDefined();
 expect(ddl).not.toMatch(/FULL|FREEZE|VERBOSE|CASCADE/i);
 expect(()=>buildReviewedVacuumDDL({schema:'pg_catalog',table:'people'})).toThrow();
 expect(()=>buildReviewedVacuumDDL({schema:'public',table:'bad;DROP'})).toThrow();
});
it('executes no transaction and obeys stored maintenance ceiling',async()=>{
 const calls=[],ctx={db:{getSqlMaintenanceTimeoutMs:async()=>600000},
  connection:{neonOrg:'org-fake'}};
 const target={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
  expectedEndpointHost:'direct.fake',database:'neondb',role:'owner',pooled:false};
 await runReviewedVacuumMutation({ctx,target,schema:'public',table:'people',
  sqlLayer:async(_c,_t,callback)=>callback({query:async text=>{calls.push(text);}})});
 expect(calls).toEqual(['SET lock_timeout = 5000','SET statement_timeout = 600000',
  'VACUUM (ANALYZE) "public"."people"']);
 expect(calls.join(' ')).not.toMatch(/BEGIN|COMMIT|ROLLBACK|VACUUM FULL/);
 await expect(runReviewedVacuumMutation({...{ctx:{...ctx,db:{getSqlMaintenanceTimeoutMs:async()=>null}},
  target,schema:'public',table:'people',sqlLayer:async()=>{throw Error('SQL called')}}}))
  .rejects.toThrow(/timeout/);
});
