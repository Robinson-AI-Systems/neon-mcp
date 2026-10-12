// Fixed documentation, not a tool executor. Pass-bearing routes remain separately authenticated.
import {rtcOpenApi} from '../src/core/rtc-contract.js';
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  return res.status(200).json(rtcOpenApi());
}
