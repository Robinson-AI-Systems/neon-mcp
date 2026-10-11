import { expect,it } from 'vitest';
import { createFakeDb } from '../../test/helpers/fake-db.js';
import { createOneTimeSecrets } from '../../src/core/one-time.js';
const fakeKey=(n)=>Buffer.alloc(32,n).toString('base64url');
const env={TOKEN_ENCRYPTION_KEY:fakeKey(23),PUBLIC_BASE_URL:'https://neon-mcp.example.test'};

it('issues a secret viewing link without revealing the encrypted secret',async()=>{
  let t=Date.now(),db=createFakeDb({clock:()=>t});
  const one=createOneTimeSecrets({db,env,now:()=>t});
  const created=await one.putOneTimeSecret({kind:'role-password',label:'Fake role',
    secret:'npg_FAKE_password_example',org:'org-fake-one'});
  expect(created.link).toContain('/api/neon/setup?once=');
  expect(JSON.stringify(created)).not.toContain('npg_FAKE_password_example');
  expect((await one.getOneTimeInfo(created.id))).toMatchObject({neon_org:'org-fake-one',kind:'role-password'});
  expect(await one.takeOneTimeSecret({id:created.id,org:'org-fake-other'})).toBeNull();
  expect(await one.takeOneTimeSecret({id:created.id,org:'org-fake-one'})).toEqual({
    kind:'role-password',secret:'npg_FAKE_password_example'
  });
  expect(await one.takeOneTimeSecret({id:created.id,org:'org-fake-one'})).toBeNull();
});
it('keeps submitted inbound secrets private and consumes each at most once',async()=>{
  const db=createFakeDb(),one=createOneTimeSecrets({db,env});
  const request=await one.requestSecret({tool:'neon_fake_tool',purpose:'Enter fake test password',org:'org-fake-one'});
  expect(request.link).toContain('secret_request=');
  expect(await one.getRequestInfo(request.id)).toMatchObject({ready:false,neon_org:'org-fake-one'});
  expect(await one.submitRequestedSecret({id:request.id,org:'org-fake-other',secret:'fake-value'})).toBe(false);
  expect(await one.submitRequestedSecret({id:request.id,org:'org-fake-one',secret:'fake-value'})).toBe(true);
  expect(await one.submitRequestedSecret({id:request.id,org:'org-fake-one',secret:'second-value'})).toBe(false);
  expect(await one.getRequestInfo(request.id)).toMatchObject({ready:true});
  expect(await one.takeRequestedSecret({id:request.id,org:'org-fake-one'})).toBe('fake-value');
  expect(await one.takeRequestedSecret({id:request.id,org:'org-fake-one'})).toBeNull();
});
it('rejects expired and wrong-key secret retrieval safely',async()=>{
  let time=Date.now(),db=createFakeDb({clock:()=>time});
  const one=createOneTimeSecrets({db,env,now:()=>time});
  const sent=await one.putOneTimeSecret({kind:'fake',label:'Fake',secret:'fake-value',org:'org-fake-one'});
  const asked=await one.requestSecret({tool:'fake_tool',purpose:'Fake',org:'org-fake-one'});
  const wrong=createOneTimeSecrets({db,env:{...env,TOKEN_ENCRYPTION_KEY:fakeKey(24)},now:()=>time});
  await expect(wrong.takeOneTimeSecret({id:sent.id,org:'org-fake-one'})).rejects.toThrow(/decrypt/);
  time+=10*60*1000+1;
  expect(await one.takeOneTimeSecret({id:sent.id,org:'org-fake-one'})).toBeNull();
  expect(await one.submitRequestedSecret({id:asked.id,org:'org-fake-one',secret:'fake-value'})).toBe(false);
});
