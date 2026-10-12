import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery}
  from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {randomBytes} from 'node:crypto';
let db;
const name='org-fake-rtc',project='proj-fake-rtc';
const pass=()=> 'rtc_pass_'+randomBytes(32).toString('base64url');
const id=()=> 'rtc_'+randomBytes(12).toString('base64url');
beforeAll(async()=>{
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();
  await db.saveNeonOrg({orgId:name,label:'Fake isolated RTC org'});
  await db.saveEncryptedNeonKey({orgId:name,kind:'project',projectId:project,
    keyEnc:'fake-encrypted-only',last4:'FAKE',reach:{verified:true}});
});
afterAll(async()=>{await closeIsolatedSchema();});
it('stores only hash, forces nonproduction read_only and supports instant scoped revocation',async()=>{
  const token=pass(),passId=id();
  const expiresAt=new Date(Date.now()+3600000);
  expect(await db.createRtcReadOnlyPass({token,passId,orgId:name,
    projectScope:project,expiresAt})).toEqual({passId});
  const saved=await db.getRtcPass(token);
  expect(saved).toMatchObject({client_id:passId,neon_org:name,
    project_scope:project,mode:'preview',profile:'read_only',
    listing:'catalog',kind:'pass',allow_writes:false,
    rtc_areas:['server','discovery']});
  const raw=await rawQuery('SELECT token_hash,refresh_hash,kind,mode,profile FROM oauth_tokens WHERE client_id=$1',[passId]);
  expect(raw).toHaveLength(1);
  expect(raw[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(raw[0].token_hash).not.toBe(token);
  expect(raw[0].refresh_hash).toBeNull();
  expect(await db.getAccessToken(token)).toBeNull();
  expect(await db.revokeRtcPass({orgId:'org-other',passId})).toBe(false);
  expect(await db.revokeRtcPass({orgId:name,passId})).toBe(true);
  expect((await db.getRtcPass(token)).revoked_at).toBeTruthy();
  expect(await db.revokeRtcPass({orgId:name,passId})).toBe(false);
});
it('refuses passes for unknown or unverified project keys and >24h expiry',async()=>{
  const base={token:pass(),passId:id(),orgId:name,
    projectScope:'proj-unknown',expiresAt:new Date(Date.now()+3600000)};
  await expect(db.createRtcReadOnlyPass(base)).rejects.toThrow(/Verified project/);
  await expect(db.createRtcReadOnlyPass({...base,projectScope:project,
    expiresAt:new Date(Date.now()+48*3600000)})).rejects.toThrow();
  await db.saveEncryptedNeonKey({orgId:name,kind:'project',projectId:'proj-fake-no-reach',
    keyEnc:'fake-ciphertext',last4:'FAKE',reach:{verified:false}});
  await expect(db.createRtcReadOnlyPass({...base,projectScope:'proj-fake-no-reach'}))
    .rejects.toThrow(/Verified project/);
});
it('rate limits 61 parallel calls to exactly 60 across simulated independent instances',async()=>{
  const key='ab'.repeat(32),now=new Date(360000);
  const [a,b]=[createDb(neonShapedQuery()),createDb(neonShapedQuery())];
  const attempts=await Promise.all(Array.from({length:61},(_,i)=>
    (i%2?a:b).consumeApiBudget({keyHash:key,windowStart:now,limit:60})));
  expect(attempts.filter(x=>x.allowed)).toHaveLength(60);
  expect(attempts.filter(x=>!x.allowed)).toHaveLength(1);
});
