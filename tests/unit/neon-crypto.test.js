import { expect,it } from 'vitest';
import { encryptSecret,decryptSecret } from '../../src/core/crypto.js';
const fakeKey=(n)=>Buffer.alloc(32,n).toString('base64url');
const env={TOKEN_ENCRYPTION_KEY:fakeKey(23)};
it('encrypts authenticated ciphertext and binds it to a specific org and key scope',()=>{
  const encoded=encryptSecret('napi_FAKE_credential_fixture',{env,context:'org-fake/project-fake'});
  expect(encoded).toMatch(/^v1\./);
  expect(encoded).not.toContain('credential_fixture');
  expect(decryptSecret(encoded,{env,context:'org-fake/project-fake'})).toBe('napi_FAKE_credential_fixture');
  expect(()=>decryptSecret(encoded,{env,context:'different-scope'})).toThrow(/Unable to decrypt/);
  expect(()=>decryptSecret(encoded,{env:{TOKEN_ENCRYPTION_KEY:fakeKey(24)},
    context:'org-fake/project-fake'})).toThrow(/Unable to decrypt/);
  // Mutate one authenticated tag byte deterministically (random ciphertext suffixes can match).
  const parts=encoded.split('.');
  parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  const bad=parts.join('.');
  expect(()=>decryptSecret(bad,{env,context:'org-fake/project-fake'})).toThrow(/Unable to decrypt/);
});
it('never accepts a missing or incorrectly-sized encryption key',()=>{
  expect(()=>encryptSecret('anything',{env:{}})).toThrow(/TOKEN_ENCRYPTION_KEY/);
  expect(()=>encryptSecret('anything',{env:{TOKEN_ENCRYPTION_KEY:'short'}})).toThrow(/TOKEN_ENCRYPTION_KEY/);
});
