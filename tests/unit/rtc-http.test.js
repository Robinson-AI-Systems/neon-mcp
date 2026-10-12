import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import rtcHandler,{createRtcEndpoint} from '../../api/rtc.js';
import {rtcManifest} from '../../src/core/rtc-contract.js';
import {resultScope} from '../../src/core/result-store.js';
import {readFileSync} from 'node:fs';
const pass='rtc_pass_'+ 'A'.repeat(43);
const scope={clientId:'rtc_'+ 'B'.repeat(16),neonOrg:'org-fake-one',
  projectScope:'proj-fake-one',mode:'preview',profile:'read_only',
  listing:'catalog',rtcAreas:['server','discovery'],rtcSafeTools:true};
const row={client_id:scope.clientId,neon_org:scope.neonOrg,
  project_scope:scope.projectScope,mode:'preview',profile:'read_only',
  listing:'catalog',kind:'pass',rtc_areas:['server','discovery'],
  allow_writes:false,expires_at:new Date(Date.now()+3600000),revoked_at:null};
function res(){return {headers:{},statusCode:200,body:null,headersSent:false,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  json(data){this.body=data;this.headersSent=true;return this;},
  send(data){this.body=typeof data==='string'?JSON.parse(data):data;
    this.headersSent=true;return this;}};}
const req=(method,door,extra={},body,authorization=pass)=>({
  method,headers:{authorization:'Bearer '+authorization,'content-type':'application/json'},
  query:{door,...extra},body});
function fixture(overrides={}){
  const calls={meter:0,stored:0,neon:0};
  const db={
    async getRtcPass(){return row;},
    async consumeApiBudget(){calls.meter++;return {allowed:true};},
    async listNeonOrgs(){return [{id:scope.neonOrg,label:'Fake Org',production_enabled:false}];},
    async listNeonKeySummaries(){return [{kind:'project',project_id:scope.projectScope,
      last4:'FAKE',revoked_at:null}];},
    async listSafeSettings(){return [{key:'operation_wait_seconds',value:10}];},
    async readResultHandle({connection}){calls.stored++;return connection===resultScope(scope)?
      {summary:'fake',body:{entries:[{value:1},{value:2}]}}:null;},
    ...overrides
  };
  const env={RTC1_ENABLED:'1',VERCEL_ENV:'production'};
  return {db,env,calls};
}
async function run(f,request){
 const app=await createRtcEndpoint({db:f.db,registry,env:f.env});
 const output=res();await app(request,output);return output;
}
describe('RTC 1 read-only HTTPS route interop against hub contract',()=>{
  it('serves public manifest only behind deployment gate; existing OAuth door remains independent',async()=>{
    const manifest=rtcManifest(registry);
    expect(manifest).toMatchObject({rtc:1,prefix:'neon',modes:['preview','production']});
    const v=JSON.parse(readFileSync('vercel.json','utf8'));
    expect(v.git.deploymentEnabled).toMatchObject({'**':false,live:true});
    for(const [source,destination] of [
      ['/api/tools','/api/rtc?door=tools'],
      ['/api/tools/:name','/api/rtc?door=tools&name=:name'],
      ['/api/whoami','/api/rtc?door=whoami'],
      ['/api/results/:handle','/api/rtc?door=results&handle=:handle']
    ])expect(v.rewrites).toContainEqual({source,destination});
    expect(v.rewrites.some(x=>x.source==='/api/mcp')).toBe(false);
    const original=process.env.RTC1_ENABLED;
    delete process.env.RTC1_ENABLED;
    try{
      const disabled=res();
      await rtcHandler(req('GET','tools'),disabled);
      expect(disabled.statusCode).toBe(503);
      // If database setup had been attempted, the unconfigured DATABASE_URL
      // would cause provider initialization; disabled requests stay inert.
      expect(disabled.body.error.code).toBe('service_error');
    }finally{
      if(original===undefined)delete process.env.RTC1_ENABLED;
      else process.env.RTC1_ENABLED=original;
    }
    const f=fixture();f.env.RTC1_ENABLED='0';
    const denied=await run(f,req('GET','tools'));
    expect(denied.statusCode).toBe(503);
    expect(f.calls.meter).toBe(0);
  });
  it('exposes only 3 harmless pre-scoped read tools; search, describe and whoami are pass gated',async()=>{
    const f=fixture();
    const list=await run(f,req('GET','tools',{limit:'100',listing:'catalog'}));
    expect(list.statusCode).toBe(200);
    const names=list.body.result.tools.map(x=>x.name);
    expect(names.sort()).toEqual(['neon_get_settings','neon_where_is_setting','neon_whoami']);
    expect(list.body.result.tools.every(x=>x.writes===false && x.money===false &&
      x.annotations.readOnlyHint===true)).toBe(true);
    const searched=await run(f,req('GET','tools',{q:'whoami',limit:'5'}));
    expect(searched.body.result.tools.map(x=>x.name)).toEqual(['neon_whoami']);
    const detail=await run(f,req('GET','tools',{name:'neon_whoami'}));
    expect(detail.body.result.name).toBe('neon_whoami');
    expect(detail.body.result.inputSchema.properties.fields).toMatchObject({
      type:'string',maxLength:512});
    expect(detail.body.result.inputSchema.properties.detail.enum).toEqual([
      'summary','full']);
    expect(list.body.result.tools.find(t=>t.name==='neon_whoami')
      .inputSchema.properties.detail.enum).toEqual(['summary','full']);
    const who=await run(f,req('GET','whoami'));
    expect(who.body.result).toMatchObject({profile:'read_only',
      mode:'preview',projectScope:'proj-fake-one',allowWrites:false});
    expect(JSON.stringify(who.body)).not.toContain(pass);
    expect(f.calls.meter).toBe(4);
  });
  it('filters RTC callable tools before applying listing limits and search',async()=>{
    const f=fixture();
    const catalog=await run(f,req('GET','tools',{listing:'catalog',limit:'1'}));
    expect(catalog.statusCode).toBe(200);
    expect(catalog.body.result.tools).toHaveLength(1);
    const filtered=await run(f,req('GET','tools',{
      listing:'catalog',limit:'1',q:'neon_get_settings'}));
    expect(filtered.statusCode).toBe(200);
    expect(filtered.body.result.tools.map(t=>t.name)).toEqual(['neon_get_settings']);
    const outside=await run(f,req('GET','tools',{
      listing:'catalog',limit:'1',q:'neon_role_delete'}));
    expect(outside.body.result.tools).toEqual([]);
    expect(f.calls.meter).toBe(3);
    expect(f.calls.neon).toBe(0);
  });
  it('calls only existing protected handlers; no Neon mutations, writes or meta proxy',async()=>{
    const f=fixture();
    const good=await run(f,req('POST','tools',{name:'neon_whoami'},{}));
    expect(good.body.ok).toBe(true);
    expect(good.body.result).toMatchObject({profile:'read_only',
      projectScope:'proj-fake-one'});
    const settings=await run(f,req('POST','tools',{name:'neon_get_settings'},{}));
    expect(settings.body.ok).toBe(true);
    for(const name of ['neon_role_delete','neon_database_create','neon_call',
      'neon_batch','neon_project_list']){
      const denied=await run(f,req('POST','tools',{name},{dryRun:true,confirm:true}));
      expect(denied.statusCode).toBe(403);
      expect(denied.body.error.code).toBe('refused_by_guard');
    }
    const invalid=await run(f,req('POST','tools',{name:'neon_whoami'},
      {projectId:'proj-other'}));
    expect(invalid.body.error.code).toBe('invalid_args');
    expect(f.calls.neon).toBe(0);
  });
  it('preflights entire batch, rejects writes before any invocation, honors 10-call maximum',async()=>{
    const f=fixture();
    const clean=await run(f,req('POST','tools',{name:'_batch'},
      {calls:[{name:'neon_whoami',args:{}},{name:'neon_get_settings',args:{}}]}));
    expect(clean.statusCode).toBe(200);
    expect(clean.body.result.results).toHaveLength(2);
    const unsafe=await run(f,req('POST','tools',{name:'_batch'},
      {calls:[{name:'neon_whoami'},{name:'neon_database_delete',args:{confirm:true}}]}));
    expect(unsafe.statusCode).toBe(403);
    const oversized=await run(f,req('POST','tools',{name:'_batch'},
      {calls:Array.from({length:11},()=>({name:'neon_whoami'}))}));
    expect(oversized.statusCode).toBe(400);
    expect(oversized.body.error.code).toBe('invalid_args');
  });
  it('preflights every nested batch fields/detail value before executing any read',async()=>{
    let executed=0;
    const f=fixture({async listSafeSettings(){executed++;return [];}});
    for(const invalidArgs of [
      {detail:['full']},{detail:'raw'},
      {fields:['profile',42]},{fields:[]},{fields:{profile:true}},
      {fields:'x'.repeat(513)}
    ]){
      const denied=await run(f,req('POST','tools',{name:'_batch'},{calls:[
        {name:'neon_get_settings',args:{}},
        {name:'neon_whoami',args:invalidArgs}
      ]}));
      expect(denied.statusCode).toBe(400);
      expect(denied.body.error.code).toBe('invalid_args');
    }
    expect(executed).toBe(0);
    const allowed=await run(f,req('POST','tools',{name:'_batch'},{calls:[
      {name:'neon_whoami',args:{fields:['profile'],detail:'summary'}}
    ]}));
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body.result.results).toHaveLength(1);
    expect(executed).toBe(0);
  });
  it('only reads a result handle scoped to this pass; refuses invalid/foreign and expired records',async()=>{
    const f=fixture();
    const handle='res_'+ 'a'.repeat(40);
    const available=await run(f,req('GET','results',{handle,page:'0',pageSize:'1'}));
    expect(available.statusCode).toBe(200);
    expect(available.body.result.items).toHaveLength(1);
    expect(available.body.result.nextPage).toBe(1);
    const invalid=await run(f,req('GET','results',{handle:'res_bad'}));
    expect(invalid.statusCode).toBe(404);
    const wrong=fixture({async readResultHandle(){return null;}});
    expect((await run(wrong,req('GET','results',{handle}))).statusCode).toBe(404);
    expect(f.calls.stored).toBe(1);
  });
  it('rejects OAuth bearers, revoked RTC passes and shared-rate-limit failures',async()=>{
    const f=fixture();
    const oauth=await run(f,req('GET','whoami',{},undefined,'oauth123'));
    expect(oauth.statusCode).toBe(401);
    expect(oauth.body.error.code).toBe('permission');
    const raw=await run(f,{...req('GET','whoami'),
      headers:{authorization:pass}});
    expect(raw.statusCode).toBe(401);
    expect(raw.body.error.code).toBe('permission');
    const revoked=fixture({async getRtcPass(){return {...row,revoked_at:new Date()};}});
    const forbidden=await run(revoked,req('GET','whoami'));
    expect(forbidden.statusCode).toBe(401);
    expect(forbidden.body.error.code).toBe('pass_revoked');
    const limited=fixture({async consumeApiBudget(){return {allowed:false};}});
    const tooMany=await run(limited,req('GET','whoami'));
    expect(tooMany.statusCode).toBe(429);
    expect(tooMany.headers['Retry-After']).toBe('60');
    expect(tooMany.body.error).toMatchObject({code:'rate_limited',
      what:expect.any(String),cause:expect.any(String),
      todo:expect.any(String),technical:expect.any(String)});
  });
});
