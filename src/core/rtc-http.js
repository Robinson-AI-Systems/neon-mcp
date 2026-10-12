// RTC 1 standalone HTTPS routing. Never accepts MCP OAuth bearer credentials.
// Early owner-approved adoption is intentionally limited to verified, harmless,
// project-scoped read_only metadata; generic write/pass expansion remains gated.
import {send} from './http.js';
import {rtcCatalog,rtcToolMetadata,rtcError} from './rtc-contract.js';
import {requireRtcPass,rtcNonproductionTool} from './rtc-passes.js';
import {dispatchReadOnlyTool} from './mcp-server.js';
import {resultScope} from './result-store.js';
import {pageStoredResult} from './result-pages.js';
const namePattern=/^neon_[a-z0-9_]{1,80}$/;
const handlePattern=/^res_[a-f0-9]{40}$/;
const error=(res,code,status)=>{
  const response=rtcError(code,{status});
  return send(res,response.status,response.body);
};
const active=(env,res)=>{
  if(env.RTC1_ENABLED==='1')return true;
  error(res,'service_error',503);return false;
};
const methods=(req,res,allowed)=>{
  if(allowed.includes(req.method))return true;
  res.setHeader('Allow',allowed.join(', '));
  error(res,'invalid_args',405);return false;
};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
function argsFrom(req){
  let input=req.body;
  if(typeof input==='string'){
    if(Buffer.byteLength(input)>16384)throw Error('Oversize JSON body');
    input=JSON.parse(input);
  }
  if(!plain(input)||Buffer.byteLength(JSON.stringify(input))>16384)
    throw Error('Invalid RTC argument envelope');
  const fields=input.fields;
  if(Array.isArray(fields)){
    if(fields.length<1||fields.length>20||fields.some(f=>
      typeof f!=='string'||f.length<1||f.length>80))
      throw Error('Invalid fields selector');
    input={...input,fields:fields.join(',')};
  }
  if(input.fields!==undefined && (typeof input.fields!=='string'||
      input.fields.length>512))
    throw Error('Invalid fields selector');
  if(input.detail!==undefined&&!['summary','full'].includes(input.detail))
    throw Error('Invalid detail selection');
  return input;
}
function safeInvocation(name,args){
  if(!namePattern.test(name||'')||!rtcNonproductionTool(name)||!plain(args))
    return false;
  const entries=Object.keys(args);
  const shared=['detail','fields'];
  if(name==='neon_where_is_setting'){
    return entries.every(k=>['setting',...shared].includes(k))&&
      typeof args.setting==='string'&&args.setting.length>=1&&
      args.setting.length<=160;
  }
  return entries.every(k=>shared.includes(k));
}
async function invoke({db,registry,connection,env,name,args}){
  const reply=await dispatchReadOnlyTool({db,registry,connection,env,name,args});
  if(reply?.isError===true||!Array.isArray(reply?.content)||
    reply.content.length!==1||reply.content[0]?.type!=='text')
    return {error:'service_error'};
  try {
    const result=JSON.parse(reply.content[0].text);
    if(result&&typeof result==='object'&&!Array.isArray(result)&&
       handlePattern.test(result.handle||'')&&result.truncated===true)
      return {result:{summary:result.summary,preview:result.preview,
        bytes:result.bytes,truncated:true},handle:result.handle,
        count:result.count??1,summary:result.summary};
    return {result};
  }catch{return {error:'service_error'};}
}
export function createRtcHttpHandlers({db,registry,env=process.env}={}){
  if(!db||!registry?.tools||!registry?.handlers)
    throw new TypeError('RTC HTTP runtime needs a validated registry and database');
  async function authorized(req,res){
    if(!active(env,res))return null;
    return requireRtcPass(req,res,db);
  }
  async function tools(req,res){
    if(!methods(req,res,['GET','POST']))return;
    const connection=await authorized(req,res);
    if(!connection)return;
    const name=req.query?.name;
    if(name!==undefined&&(Array.isArray(name)||
      (name!=='_batch'&&!namePattern.test(name))))
      return error(res,'not_found',404);
    if(name===undefined){
      if(req.method!=='GET')return error(res,'invalid_args',405);
      const q=req.query||{};
      let limit;
      if(q.limit===undefined)limit=20;
      else if(typeof q.limit==='string'&&/^\d{1,3}$/.test(q.limit))
        limit=Number(q.limit);
      else return error(res,'invalid_args',400);
      try{
        // Filter to genuinely callable RTC tools before discovery pagination.
        // Filtering after limit would silently hide valid read-only tools.
        const scoped={tools:registry.tools.filter(t=>
          rtcNonproductionTool(t.name)&&t.writes===false&&
          t.profiles?.includes(connection.profile))};
        const visible=rtcCatalog(scoped,connection,{
          q:q.q,area:q.area,audience:q.audience,listing:q.listing,limit},env);
        return send(res,200,{ok:true,result:{tools:visible,
          count:visible.length,next:null,listing:q.listing||connection.listing}});
      }catch{return error(res,'invalid_args',400);}
    }
    if(name==='_batch'){
      if(req.method!=='POST')return error(res,'invalid_args',405);
      let calls;
      try {calls=argsFrom(req).calls;}catch{return error(res,'invalid_args',400);}
      if(!Array.isArray(calls)||calls.length<1||calls.length>10)
        return error(res,'invalid_args',400);
      if(calls.some(c=>!plain(c)||!namePattern.test(c.name||'')||
           !rtcNonproductionTool(c.name)||!safeInvocation(c.name,c.args??{}) ||
           !registry.tools.some(t=>t.name===c.name && t.writes===false &&
             t.profiles?.includes(connection.profile)) ||
           Object.keys(c).some(k=>!['name','args'].includes(k))))
        return error(res,'refused_by_guard',403);
      // Full preflight is complete before any handler executes.
      const results=[];
      for(const c of calls){
        const output=await invoke({db,registry,env,connection,name:c.name,args:c.args??{}});
        if(output.error)return error(res,output.error,503);
        results.push(output.result);
      }
      return send(res,200,{ok:true,result:{results}});
    }
    if(!rtcNonproductionTool(name))
      return error(res,'refused_by_guard',403);
    const meta=registry.tools.find(t=>t.name===name);
    if(!meta||meta.writes!==false||
       !meta.profiles?.includes(connection.profile))
      return error(res,'not_found',404);
    if(req.method==='GET')return send(res,200,{ok:true,result:rtcToolMetadata(meta)});
    let args;
    try {args=argsFrom(req);}catch{return error(res,'invalid_args',400);}
    if(!safeInvocation(name,args))return error(res,'invalid_args',400);
    const output=await invoke({db,registry,env,connection,name,args});
    if(output.error)return error(res,output.error,503);
    return send(res,200,{ok:true,...output});
  }
  async function whoami(req,res){
    if(!methods(req,res,['GET']))return;
    const connection=await authorized(req,res);
    if(!connection)return;
    return send(res,200,{ok:true,result:{server:'robinson-neon-mcp',
      prefix:'neon',profile:connection.profile,mode:connection.mode,
      projectScope:connection.projectScope,allowWrites:false,
      areas:connection.rtcAreas}});
  }
  async function results(req,res){
    if(!methods(req,res,['GET']))return;
    const connection=await authorized(req,res);
    if(!connection)return;
    const handle=req.query?.handle;
    if(typeof handle!=='string'||!handlePattern.test(handle))
      return error(res,'not_found',404);
    const rawPage=req.query?.page??'0',rawSize=req.query?.pageSize??'10';
    if(typeof rawPage!=='string'||!/^\d{1,6}$/.test(rawPage)||
       typeof rawSize!=='string'||!/^\d{1,2}$/.test(rawSize))
      return error(res,'invalid_args',400);
    const page=Number(rawPage),pageSize=Number(rawSize);
    if(page>100000||pageSize<1||pageSize>50)return error(res,'invalid_args',400);
    try{
      const stored=await db.readResultHandle({handle,connection:resultScope(connection)});
      if(!stored)return error(res,'not_found',404);
      const fields=req.query?.fields;
      if(fields!==undefined&&(typeof fields!=='string'||fields.length>512))
        return error(res,'invalid_args',400);
      const data=pageStoredResult(stored.body,{page,pageSize,fields});
      return send(res,200,{ok:true,result:{handle,summary:stored.summary,...data}});
    }catch{return error(res,'service_error',503);}
  }
  return {tools,whoami,results};
}
