// Public RTC 1 identity is withheld while the authenticated HTTPS pass surface is incomplete.
import {registry} from '../src/tools/index.js';
import {rtcManifest} from '../src/core/rtc-contract.js';
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  if(process.env.RTC1_ENABLED!=='1')
    return res.status(503).json({status:'rtc_integration_in_progress',
      detail:'The standalone MCP endpoint remains available; RTC pass authorization is not yet active.'});
  return res.status(200).json(rtcManifest(registry));
}
