import { expect,it } from 'vitest';
import { encryptSecret,decryptSecret } from '../../src/core/crypto.js';
const env={TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,23).toString('base64url')};
it('encrypts authenticated ciphertext and binds it to a specific org and key scope',()=>{
  const encoded=encryptSecret('napi_FAKE_credential_fixture',{env,context:'org-fake/project-fake'});
  expect(encoded).toMatch(/^v1\./);
  expect(encoded).not.toContain('credential_fixture');
  expect(decryptSecret(encoded,{env,context:'org-fake/project-fake'})).toBe('napi_FAKE_credential_fixture');
  expect(()=>decryptSecret(encoded,{env,context:'different-scope'})).toThrow(/Unable to decrypt/);
  expect(()=>decryptSecret(encoded,{env:{TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,24).toString('base64url')},
    context:'org-fake/project-fake'})).toThrow(/Unable to decrypt/);
  const bad=encoded.slice(0,-2)+'ab';
  expect(()=>decryptSecret(bad,{env,context:'org-fake/project-fake'})).toThrow(/Unable to decrypt/);
});
it('never accepts a missing or incorrectly-sized encryption key',()=>{
  expect(()=>encryptSecret('anything',{env:{}})).toThrow(/TOKEN_ENCRYPTION_KEY/);
  expect(()=>encryptSecret('anything',{env:{TOKEN_ENCRYPTION_KEY:'short'}})).toThrow(/TOKEN_ENCRYPTION_KEY/);
});
