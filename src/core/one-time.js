// Contract-generic single-use exchange. It never returns a secret in links, logs, or MCP tool metadata.
import { randomToken } from './oauth.js';
import { encryptSecret, decryptSecret } from './crypto.js';
import { publicOrigin } from './http.js';
const TTL_MS=10*60*1000;
export function createOneTimeSecrets({ db,env=process.env,now=()=>Date.now() }={}) {
  if(typeof db?.saveOneTimeSecret!=='function' || typeof db?.consumeSecretRequest!=='function')
    throw new TypeError('A durable secret-exchange database is required');
  const origin=()=>publicOrigin(env);
  const valid=(value)=>typeof value==='string'&&value.trim().length>0;
  function expires() {return new Date(now()+TTL_MS);}
  const aad=(org,id,direction)=>JSON.stringify([org,id,direction]);
  async function putOneTimeSecret({ kind,label,secret,org }) {
    if(!valid(org)||!valid(kind)||!valid(label)||!valid(secret))
      throw new TypeError('Organization, kind, label and secret are required');
    const id=randomToken(24);
    const ciphertext=encryptSecret(secret,{env,context:aad(org,id,'out')});
    await db.saveOneTimeSecret({id,orgId:org,kind,label,ciphertext,expiresAt:expires()});
    return {id,link:origin()+'/api/neon/setup?once='+encodeURIComponent(id)};
  }
  async function takeOneTimeSecret({id,org}) {
    if(!valid(id)||!valid(org)) return null;
    const row=await db.consumeOneTimeSecret({id,orgId:org});
    return row ? {kind:row.kind,secret:decryptSecret(row.ciphertext,{env,context:aad(org,id,'out')})}:null;
  }
  async function requestSecret({tool,purpose,org}) {
    if(!valid(org)||!valid(tool)||!valid(purpose)) throw new TypeError('Missing secret request fields');
    const id=randomToken(24);
    await db.createSecretRequest({id,orgId:org,tool,purpose,expiresAt:expires()});
    return {id,link:origin()+'/api/neon/setup?secret_request='+encodeURIComponent(id)};
  }
  async function submitRequestedSecret({id,org,secret}) {
    if(!valid(id)||!valid(org)||!valid(secret)) return false;
    const ciphertext=encryptSecret(secret,{env,context:aad(org,id,'in')});
    return db.fulfillSecretRequest({id,orgId:org,ciphertext});
  }
  async function takeRequestedSecret({id,org}) {
    if(!valid(id)||!valid(org)) return null;
    const row=await db.consumeSecretRequest({id,orgId:org});
    return row ? decryptSecret(row.ciphertext,{env,context:aad(org,id,'in')}):null;
  }
  async function getOneTimeInfo(id) {return db.getOneTimeSecretInfo(id);}
  async function getRequestInfo(id) {return db.getSecretRequestInfo(id);}
  return {putOneTimeSecret,takeOneTimeSecret,requestSecret,submitRequestedSecret,
    takeRequestedSecret,getOneTimeInfo,getRequestInfo};
}
