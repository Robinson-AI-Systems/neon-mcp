import {it,expect} from 'vitest';
import {parse} from 'libpg-query';
import {classifySql} from '../../src/neon/sql-guard.js';
import {buildReviewedIndexDDL,runReviewedIndexMutation} from '../../src/neon/sql-run.js';
import {INDEX_INVENTORY_SQL} from '../../src/tools/schema-index-write.js';
it('pins concurrent create/drop ASTs and quotes all identifiers',async()=>{
 expect((await classifySql(INDEX_INVENTORY_SQL)).kind).toBe('read');
 const create=buildReviewedIndexDDL({schema:'public',table:'people',index:'people_idx',columns:['id']});
 const stmt=(await parse(create)).stmts[0].stmt.IndexStmt;
 expect(stmt.concurrent).toBe(true);expect(stmt.unique).not.toBe(true);
 const drop=buildReviewedIndexDDL({schema:'public',index:'people_idx',remove:true});
 expect((await parse(drop)).stmts[0].stmt.DropStmt).toMatchObject({concurrent:true,behavior:'DROP_RESTRICT',removeType:'OBJECT_INDEX'});
 expect(buildReviewedIndexDDL({schema:'public',table:'people',index:'odd"name',columns:['odd"column']})).toContain('"odd""name"');
 expect(()=>buildReviewedIndexDDL({schema:'pg_catalog',table:'people',index:'idx',columns:['id']})).toThrow();
});
it('bounds session settings and issues one DDL outside a transaction without retry',async()=>{
 const calls=[],ctx={db:{},connection:{neonOrg:'org-fake'}},target={projectId:'proj-fake',branchId:'br-fake',
 endpointId:'ep-fake',expectedEndpointHost:'direct.fake',database:'neondb',role:'owner',pooled:false};
 await runReviewedIndexMutation({ctx,target,schema:'public',table:'people',index:'idx',columns:['id'],
 sqlLayer:async(_scope,_target,fn)=>fn({query:async text=>{calls.push(text);return {rows:[]};}})});
 expect(calls).toHaveLength(3);expect(calls.slice(0,2)).toEqual(['SET lock_timeout = 5000','SET statement_timeout = 15000']);
 expect(calls.join(' ')).not.toMatch(/BEGIN|CASCADE/);
});
