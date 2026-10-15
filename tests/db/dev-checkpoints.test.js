import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {checkpointStore,initCheckpoints} from '../../src/db-checkpoints.js';
const run=async(text,args=[])=>rawQuery(text,args);
const tag=(strings,...params)=>run(strings.map((part,i)=>part+
 (i<params.length?'$'+(i+1):'')).join(''),params);
const orgId='org-cptest',projectId='proj-cptest',runId='run-cptest',
 branchId='br-cptest',name='beforeMigration';
const id='cp_'+'a'.repeat(40);
const base={id,orgId,projectId,runId,branchId,name};
const store=checkpointStore(tag);
beforeAll(async()=>{
 await openIsolatedSchema(requireLocalDatabaseUrl());
 await run('CREATE TABLE dev_runs (id text PRIMARY KEY,neon_org text NOT NULL,project_id text NOT NULL,status text NOT NULL)');
 await run('CREATE TABLE dev_run_objects (run_id text NOT NULL REFERENCES dev_runs(id),object_type text NOT NULL,object_id text NOT NULL,expires_at timestamptz,cleaned boolean DEFAULT FALSE,PRIMARY KEY (run_id,object_type,object_id))');
 await initCheckpoints(tag);
 await run('INSERT INTO dev_runs (id,neon_org,project_id,status) VALUES ($1,$2,$3,$4)',
  [runId,orgId,projectId,'active']);
 await run('INSERT INTO dev_run_objects (run_id,object_type,object_id,expires_at) VALUES ($1,$2,$3,$4)',
  [runId,'branch',branchId,new Date(Date.now()+86400000).toISOString()]);
});
afterAll(async()=>closeIsolatedSchema());
describe('V-3 service-owned checkpoint persistence: PostgreSQL',()=>{
 it('persists exact named branch WAL point, once; returns it only for its owner',async()=>{
  const one=await store.saveDevCheckpoint({...base,lsn:'1/ABCDEF'});
  expect(one).toMatchObject({id,name,lsn:'1/ABCDEF'});
  expect(await store.getDevCheckpoint(base)).toMatchObject({id,name,lsn:'1/ABCDEF'});
  expect(await store.saveDevCheckpoint({...base,lsn:'1/ABCDE0'})).toBe(null);
  expect(await store.getDevCheckpoint({...base,orgId:'foreign-org'})).toBe(null);
  expect(await store.getDevCheckpoint({...base,branchId:'br-foreign'})).toBe(null);
  expect(await store.getDevCheckpoint({...base,runId:'run-foreign'})).toBe(null);
  expect(await store.getDevCheckpoint({...base,name:'otherName'})).toBe(null);
  const all=await run('SELECT count(*)::integer AS n FROM dev_checkpoints');
  expect(all).toEqual([{n:1}]);
 });
 it('refuses malformed LSN and name, closed runs and expired ledger objects',async()=>{
  await expect(store.saveDevCheckpoint({...base,name:'bad name',lsn:'1/F'}))
   .rejects.toThrow(/checkpoint/);
  await expect(store.saveDevCheckpoint({...base,id:'cp_'+'b'.repeat(40),
   name:'badName',lsn:'invalid'})).rejects.toThrow(/checkpoint/);
  await run("UPDATE dev_runs SET status='cleaned' WHERE id=$1",[runId]);
  expect(await store.getDevCheckpoint(base)).toBe(null);
  expect(await store.saveDevCheckpoint({...base,id:'cp_'+'b'.repeat(40),
   name:'later',lsn:'1/F'})).toBe(null);
  await run("UPDATE dev_runs SET status='active' WHERE id=$1",[runId]);
  await run("UPDATE dev_run_objects SET expires_at='2020-01-01T00:00:00Z' WHERE run_id=$1",[runId]);
  expect(await store.getDevCheckpoint(base)).toBe(null);
  expect(await store.saveDevCheckpoint({...base,id:'cp_'+'c'.repeat(40),
   name:'expired',lsn:'1/F'})).toBe(null);
 });
});