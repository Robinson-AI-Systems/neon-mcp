import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db;
const org='org-fake-runs',proj='proj-fake-runs',other='proj-fake-foreign';
beforeAll(async()=>{
 await openIsolatedSchema(requireLocalDatabaseUrl());
 db=createDb(neonShapedQuery());await db.initSchema();
});
afterAll(async()=>await closeIsolatedSchema());
it('seeds bounded developer TTL and compute limits and real owned tables',async()=>{
 expect(await db.getDevSettings()).toMatchObject({
  ttl_hours:24,compute:{min_cu:0.25,max_cu:1,suspend_seconds:300}});
 const tables=await rawQuery("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=current_schema() AND tablename LIKE 'dev_%' ORDER BY tablename");
 expect(tables.map(x=>x.tablename)).toEqual(['dev_run_objects','dev_runs']);
});
it('atomically scopes run and branch ownership by organization/project/connection',async()=>{
 const first={id:'run-first',orgId:org,projectId:proj,connectionId:'conn-first'};
 expect(await db.reserveDevRun(first)).toMatchObject({id:'run-first'});
 expect(await db.reserveDevRun(first)).toMatchObject({id:'run-first'});
 expect(await db.reserveDevRun({...first,connectionId:'conn-other'})).toBeNull();
 expect(await db.reserveDevRun({...first,projectId:other})).toBeNull();
 expect(await db.getDevRun({orgId:org,projectId:other,runId:'run-first'})).toBeNull();
 const expires='2026-10-16T00:00:00Z';
 expect(await db.recordDevRunBranch({orgId:org,projectId:proj,
  runId:'run-first',branchId:'br-fake-run-01',parentId:'br-fake-parent',expiresAt:expires})).toBe(true);
 expect(await db.recordDevRunBranch({orgId:org,projectId:other,
  runId:'run-first',branchId:'br-fake-run-02',parentId:'br-fake-parent',expiresAt:expires})).toBe(false);
 expect(await db.recordDevRunBranch({orgId:org,projectId:proj,
  runId:'run-first',branchId:'br-fake-run-01',parentId:'br-fake-parent',expiresAt:expires})).toBe(false);
 expect((await db.listDevRunObjects({orgId:org,projectId:proj,runId:'run-first'})))
  .toMatchObject([{object_id:'br-fake-run-01',parent_id:'br-fake-parent',cleaned:false}]);
 expect(await db.listDevRunObjects({orgId:org,projectId:other,runId:'run-first'})).toEqual([]);
 const second={id:'run-second',orgId:org,projectId:proj,connectionId:'conn-second'};
 expect(await db.reserveDevRun(second)).toMatchObject({id:'run-second'});
 await expect(db.recordDevRunBranch({orgId:org,projectId:proj,
  runId:'run-second',branchId:'br-fake-run-01',parentId:'br-fake-parent',expiresAt:expires}))
  .rejects.toThrow();
 const list=await db.listDevRuns({orgId:org,projectId:proj});
 expect(list.map(x=>x.id).sort()).toEqual(['run-first','run-second']);
 expect(list.find(x=>x.id==='run-first')).toMatchObject({objects:1,remaining:1});
 expect(await db.listDevRuns({orgId:org,projectId:other})).toEqual([]);
});
it('marks only recorded objects cleaned and completes only when no objects remain',async()=>{
 expect(await db.finishDevRun({orgId:org,projectId:proj,runId:'run-first'})).toBe(false);
 expect(await db.markDevRunBranchCleaned({orgId:org,projectId:other,runId:'run-first',
  branchId:'br-fake-run-01',note:'forged'})).toBe(false);
 expect(await db.markDevRunBranchCleaned({orgId:org,projectId:proj,runId:'run-first',
  branchId:'br-fake-run-02',note:'not ours'})).toBe(false);
 expect(await db.markDevRunBranchCleaned({orgId:org,projectId:proj,runId:'run-first',
  branchId:'br-fake-run-01',note:'verified absent'})).toBe(true);
 expect(await db.markDevRunBranchCleaned({orgId:org,projectId:proj,runId:'run-first',
  branchId:'br-fake-run-01',note:'duplicate'})).toBe(false);
 expect(await db.finishDevRun({orgId:org,projectId:proj,runId:'run-first'})).toBe(true);
 expect(await db.recordDevRunBranch({orgId:org,projectId:proj,
  runId:'run-first',branchId:'br-fake-run-03',parentId:'br-fake-parent',
  expiresAt:'2026-10-16T00:00:00Z'})).toBe(false);
 expect((await db.getDevRun({orgId:org,projectId:proj,runId:'run-first'})).status)
  .toBe('cleaned');
});
