// Portable authenticated encryption. Never log ciphertext or key material.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey(env = process.env) {
  const text = env.TOKEN_ENCRYPTION_KEY;
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(text))
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured. Set a random 32-byte base64url key in Vercel.');
  const key = Buffer.from(text,'base64url');
  if (key.length !== 32 || key.toString('base64url') !== text)
    throw new Error('TOKEN_ENCRYPTION_KEY must be a random 32-byte base64url key.');
  return key;
}
export function encryptSecret(secret,{env=process.env,context=''}={}) {
  if (typeof secret !== 'string' || !secret.length) throw new TypeError('Secret must be nonempty');
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',encryptionKey(env),iv);
  cipher.setAAD(Buffer.from(String(context)));
  const body=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),
    body.toString('base64url')].join('.');
}
export function decryptSecret(payload,{env=process.env,context=''}={}) {
  try {
    const key=encryptionKey(env);
    if(typeof payload!=='string') throw new Error('Invalid payload');
    const segments=payload.split('.');
    if(segments.length!==4||segments[0]!=='v1') throw new Error('Invalid version');
    const [,iv,tag,body]=segments;
    if(Buffer.from(iv,'base64url').length!==12||Buffer.from(tag,'base64url').length!==16)
      throw new Error('Invalid frame');
    const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
    decipher.setAAD(Buffer.from(String(context)));
    decipher.setAuthTag(Buffer.from(tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt the secret. Check server encryption configuration and authorization.');
  }
}
