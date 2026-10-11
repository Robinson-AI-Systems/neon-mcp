import {beforeAll,afterAll,expect,it} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db;
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();});
afterAll(async()=>{await closeIsolatedSchema();});
const attempt=()=>({orgId:'org-fake',projectId:'prj-fake',mode:'preview',
  tool:'neon_sample_write',target:'br-fake',summary:'Update a throwaway branch',
  requestKey:'rmcp_sample_write_test12345'});
it('claims one external write atomically across simultaneous requests',async()=>{
  const [a,b]=await Promise.all([db.reserveWrite(attempt()),db.reserveWrite(attempt())]);
  expect([a.created,b.created].sort()).toEqual([false,true]);
  const existing=a.created?b.existing:a.existing;
  expect(existing.neon_org).toBe('org-fake');
  expect(existing.confirmed).toBe('pending');
  const id=a.created?a.id:b.id;
  expect(await db.completeWrite({id,orgId:'org-fake',confirmed:'true',
    operationIds:['op-fake'],inverse:{tool:'neon_undo_sample',args:{branch_id:'br-fake'}}})).toBe(true);
  expect(await db.completeWrite({id,orgId:'org-fake',confirmed:'false'})).toBe(false);
  const again=await db.reserveWrite(attempt());
  expect(again.existing.confirmed).toBe('true');
  const rows=await rawQuery('SELECT count(*)::int as total FROM change_log WHERE dry_run = false');
  expect(rows[0].total).toBe(1);
});
it('keeps previews separate from real reservations and never stores raw target state',async()=>{
  await db.recordWritePreview({orgId:'org-fake',tool:'neon_sample_write',
    mode:'preview',target:'br-fake',summary:'Safe preview'});
  const rows=await rawQuery('SELECT dry_run,request_key,before,after FROM change_log WHERE dry_run = true');
  expect(rows[0]).toEqual({dry_run:true,request_key:null,before:null,after:null});
});
