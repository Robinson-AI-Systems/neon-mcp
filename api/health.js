import {serviceHealth} from '../src/service-health.js';
import {send} from '../src/core/http.js';
export function createHealthHandler({env=process.env,health=serviceHealth}={}){
  return async(req,res)=>{
    if(req.method!=='GET'){
      res.setHeader('Allow','GET');
      return send(res,405,{error:'method_not_allowed'});
    }
    const state=await health({env});
    return send(res,state.status==='ok'?200:503,state);
  };
}
export default createHealthHandler();
