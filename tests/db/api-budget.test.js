import { beforeAll,afterAll,expect,it } from 'vitest';
import { createDb } from '../../src/db.js';
import { makeNeonBudget } from '../../src/neon/budget.js';
import { openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery } from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';
let db;
beforeAll(async()=>{
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();
});
afterAll(async()=>{await closeIsolatedSchema();});
it('shares 500 admissions and refuses the 501st across two client instances',async()=>{
  let t=120050;
  const a=makeNeonBudget({db,apiKey:'napi_FAKE_shared_key',now:()=>t});
  const b=makeNeonBudget({db,apiKey:'napi_FAKE_shared_key',now:()=>t});
  const res=await Promise.all(Array.from({length:501},(_,i)=>(i%2?a:b).consume()));
  expect(res.filter(v=>v.allowed)).toHaveLength(500);
  expect(res.filter(v=>!v.allowed)).toHaveLength(1);
  const rows=await rawQuery('SELECT key,count FROM rate_limits');
  expect(rows).toHaveLength(1);
  expect(rows[0].key).toMatch(/^[a-f0-9]{64}$/);
  expect(rows[0].count).toBe(500);
  t+=60000;
  expect((await a.consume()).allowed).toBe(true);
  expect((await b.consume()).count).toBe(2);
});
it('tracks distinct keys independently and prunes only expired windows',async()=>{
  const another=makeNeonBudget({db,apiKey:'napi_FAKE_other_key',now:()=>120050});
  expect((await another.consume()).allowed).toBe(true);
  expect(await db.pruneApiBudget({before:new Date(180000)})).toBe(2);
  expect((await rawQuery('SELECT count(*)::int AS total FROM rate_limits'))[0].total).toBe(1);
  await expect(db.consumeApiBudget({keyHash:'plaintext',windowStart:new Date(120000)})).rejects.toThrow();
});
