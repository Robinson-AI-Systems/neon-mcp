// A single authenticated RTC HTTPS entrypoint with fixed, unambiguous Vercel rewrites.
// The normal OAuth-only /api/mcp door is completely separate.
import {createDb} from '../src/db.js';
import {registry} from '../src/tools/index.js';
import {createRtcHttpHandlers} from '../src/core/rtc-http.js';
import {rtcError} from '../src/core/rtc-contract.js';
export const config={api:{bodyParser:{sizeLimit:'16kb'}}};
export async function createRtcEndpoint({db,registry:catalog,env=process.env}){
  const handlers=createRtcHttpHandlers({db,registry:catalog,env});
  return async function rtc(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    const door=req.query?.door;
    const handler=door==='tools'?handlers.tools:
      door==='whoami'?handlers.whoami:
      door==='results'?handlers.results:null;
    if(!handler)return res.status(404).json(rtcError('not_found',{status:404}).body);
    try{return await handler(req,res);}
    catch{
      // Never serialize provider, SQL or database exceptions (including credentials).
      if(!res.headersSent)
        return res.status(503).json(rtcError('service_error',{status:503}).body);
    }
  };
}
export default async function handler(req,res){
  try{
    const db=createDb();
    await db.initSchema();
    const route=await createRtcEndpoint({db,registry});
    return route(req,res);
  }catch{
    if(!res.headersSent)return res.status(503).json(rtcError('service_error',{status:503}).body);
  }
}
