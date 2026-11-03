// Shared HTTP adapter for the normal customer OAuth handoff. The historic
// developer-named URL is only a redirect-URI compatibility alias, not an
// internal developer sign-in or test-grant authority.
import {clientIp} from '../core/oauth.js';
import {neon} from '@neondatabase/serverless';
import {createHandoff} from './handoff.js';
import {handoffStore,HANDOFF_SCHEMA,HANDOFF_LIMIT_SCHEMA} from './handoff-store.js';
import {createDb} from '../db.js';
import {publicOrigin} from '../core/http.js';

export function createHandoffEndpoint({callbackPath,errorCode='connection_unavailable'}){
 if(!['/api/connect/handoff','/api/developer/connect'].includes(callbackPath))
   throw new TypeError('Unrecognized mobile OAuth callback');
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
   if(!['GET','POST'].includes(req.method)){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'method_not_allowed'});
   }
   if(req.method==='POST'&&(!req.body||Buffer.byteLength(JSON.stringify(req.body))>4096))
    return res.status(413).json({error:'request_too_large'});
   const origin=publicOrigin(process.env);
   const sql=neon(process.env.DATABASE_URL);
   const query=(text,values)=>typeof sql.query==='function'?sql.query(text,values):sql(text,values);
   await query(HANDOFF_SCHEMA);await query(HANDOFF_LIMIT_SCHEMA);
   const db=createDb();
   return await createHandoff({store:handoffStore(query),origin,clientIp,
     getClient:id=>db.getOAuthClient(id),callbackPath})(req,res);
  }catch{return res.status(503).json({error:errorCode});}
 };
}
