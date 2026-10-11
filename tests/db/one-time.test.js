import { beforeAll,afterAll,expect,it } from 'vitest';
import { createDb } from '../../src/db.js';
import { openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery } from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';
let db;beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();});
afterAll(async()=>{await closeIsolatedSchema();});
it('one-time outbound ciphertext cannot be read twice or across organizations',async()=>{
  const entry={id:'fake-outgoing',orgId:'org-fake-one',kind:'password',label:'Fake',
    ciphertext:'ciphertext-fake-only',expiresAt:new Date(Date.now()+600000)};
  await db.saveOneTimeSecret(entry);
  expect(await db.getOneTimeSecretInfo(entry.id)).toMatchObject({
    id:entry.id,neon_org:entry.orgId,kind:'password',label:'Fake'
  });
  expect(await db.consumeOneTimeSecret({id:entry.id,orgId:'org-fake-other'})).toBeNull();
  const concurrent=await Promise.all(Array.from({length:3},
    ()=>db.consumeOneTimeSecret({id:entry.id,orgId:entry.orgId})));
  expect(concurrent.filter(Boolean)).toHaveLength(1);
  expect(concurrent.find(Boolean).ciphertext).toBe(entry.ciphertext);
  expect(await db.getOneTimeSecretInfo(entry.id)).toBeNull();
});
it('inbound request can be filled once, then atomically consumed once',async()=>{
  const entry={id:'fake-incoming',orgId:'org-fake-one',tool:'fake-tool',
    purpose:'Fake',expiresAt:new Date(Date.now()+600000)};
  await db.createSecretRequest(entry);
  expect(await db.getSecretRequestInfo(entry.id)).toMatchObject({ready:false});
  expect(await db.fulfillSecretRequest({id:entry.id,orgId:'org-fake-other',
    ciphertext:'wrong-ciphertext'})).toBe(false);
  const results=await Promise.all([db.fulfillSecretRequest({id:entry.id,orgId:entry.orgId,
    ciphertext:'fake-first'}),db.fulfillSecretRequest({id:entry.id,orgId:entry.orgId,
    ciphertext:'fake-second'})]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await db.getSecretRequestInfo(entry.id)).toMatchObject({ready:true});
  const values=await Promise.all([db.consumeSecretRequest({id:entry.id,orgId:entry.orgId}),
    db.consumeSecretRequest({id:entry.id,orgId:entry.orgId})]);
  expect(values.filter(Boolean)).toHaveLength(1);
  expect((await rawQuery('SELECT count(*)::int AS n FROM secret_requests'))[0].n).toBe(0);
});
it('expired secrets and incoming requests can never be consumed',async()=>{
  const expiry=new Date(Date.now()-1000);
  await db.saveOneTimeSecret({id:'fake-expired',orgId:'org-fake-one',
    kind:'test',label:'Fake',ciphertext:'fake-ciphertext',expiresAt:expiry});
  await db.createSecretRequest({id:'fake-expired-request',orgId:'org-fake-one',
    tool:'fake',purpose:'Fake',expiresAt:expiry});
  expect(await db.consumeOneTimeSecret({id:'fake-expired',orgId:'org-fake-one'})).toBeNull();
  expect(await db.fulfillSecretRequest({id:'fake-expired-request',orgId:'org-fake-one',
    ciphertext:'fake-ciphertext'})).toBe(false);
});
