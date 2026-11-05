import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {createRtcHttpHandlers} from '../../src/core/rtc-http.js';
import {resultScope} from '../../src/core/result-store.js';
import {hashToken} from '../../src/core/oauth.js';

const pass='rtc_pass_'+'A'.repeat(43);
const secondPass='rtc_pass_'+'C'.repeat(43);
const client='rtc_'+'B'.repeat(16);
const base={client_id:client,neon_org:'org-fake-one',project_scope:'proj-fake-one',
  mode:'preview',profile:'read_only',listing:'catalog',kind:'pass',
  rtc_areas:['server','discovery'],allow_writes:false,rtc_requests_per_minute:60,
  expires_at:new Date(Date.now()+3600000),revoked_at:null};
const connection={clientId:client,neonOrg:base.neon_org,projectScope:base.project_scope,
  mode:'preview',profile:'read_only',
  rtcResultGrant:hashToken('rtc2-cursor:'+pass)};
function response(){return {headers:{},statusCode:200,body:null,headersSent:false,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  json(v){this.body=v;this.headersSent=true;return this;},
  send(v){this.body=typeof v==='string'?JSON.parse(v):v;this.headersSent=true;return this;}};}
const request=(door,query={},authorization=pass)=>({
  method:'GET',query,headers:{authorization:'Bearer '+authorization}});
function fixture(overrides={}){
  const counts={read:0,meter:0};
  const text=JSON.stringify({items:Array.from({length:700},(_,i)=>({i,label:'👍 hello'+i}))});
  const db={
    async getRtcPass(){return {...base};},
    async consumeApiBudget(){counts.meter++;return {allowed:true};},
    async readResultHandle({connection:scope}){counts.read++;
      return scope===resultScope(connection)?{canonical_text:text}:null;},
    ...overrides
  };
  const handlers=createRtcHttpHandlers({db,registry,env:{
    RTC1_ENABLED:'1',VERCEL_ENV:'production'},wireVersion:2});
  async function call(door,query={},authorization=pass){
    const res=response();await handlers[door](request(door,query,authorization),res);return res;
  }
  async function post(name,body,authorization=pass){
    const res=response();
    await handlers.tools({...request('tools',{name},authorization),
      method:'POST',body},res);
    return res;
  }
  return {call,post,counts,text};
}
describe('RTC 2 scoped HTTP dialect (not yet public-advertised)',()=>{
  it('preflights scoped batches and distinguishes unknown, known-denied, and malformed calls',async()=>{
    let executed=0;
    const f=fixture({
      async listNeonOrgs(){executed++;return [{
        id:base.neon_org,label:'Fake tenant',production_enabled:false
      }];},
      async listNeonKeySummaries(){return [];}
    });
    const payload=name=>({calls:[
      {name:'neon_whoami',args:{}},{name,args:{}}
    ]});
    const unknown=await f.post('_batch',payload('neon_tool_that_does_not_exist'));
    expect(unknown.statusCode).toBe(404);
    expect(unknown.body.error.code).toBe('not_found');
    const outside=await f.post('_batch',payload('neon_role_delete'));
    expect(outside.statusCode).toBe(403);
    expect(outside.body.error.code).toBe('outside_scope');
    expect(executed).toBe(0); // Rejected batches never execute an earlier good call.
    const allowed=await f.post('_batch',payload('neon_whoami'));
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body.result.results).toHaveLength(2);
    const invalid=await f.post('_batch',{calls:[
      {name:'neon_whoami',args:{}},
      {name:'neon_whoami',args:{bad_selector:true}}
    ]});
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body.error.code).toBe('invalid_args');
    expect(executed).toBe(2); // Only the two approved calls reached the named handler.
    for(const r of [unknown,outside,invalid]){
      expect(r.body).not.toHaveProperty('result');
      expect(JSON.stringify(r.body)).not.toContain(pass);
    }
  });
  it('attests the authenticated pass principal and scope without leaking grant material',async()=>{
    const f=fixture();
    const res=await f.call('whoami');
    expect(res.statusCode).toBe(200);
    expect(res.body.result).toMatchObject({
      principal:{kind:'pass',id:base.client_id,organizationId:base.neon_org},
      profile:'read_only',mode:'preview',allowWrites:false,
      projectScope:base.project_scope,areas:base.rtc_areas,
      requestsPerMinute:60
    });
    expect(JSON.stringify(res.body)).not.toContain(pass);
    expect(JSON.stringify(res.body)).not.toContain(hashToken('rtc2-cursor:'+pass));
    expect(f.counts.meter).toBe(1);
  });
  it('distinguishes known out-of-scope tools from unknown names without leaking data',async()=>{
    const f=fixture();
    const outside=await f.call('tools',{name:'neon_project_delete'});
    expect(outside.statusCode).toBe(403);
    expect(outside.body).toMatchObject({ok:false,error:{code:'outside_scope'}});
    const absent=await f.call('tools',{name:'neon_missing_tool_name'});
    expect(absent.statusCode).toBe(404);
    expect(absent.body).toMatchObject({ok:false,error:{code:'not_found'}});
    expect(JSON.stringify(outside.body)+JSON.stringify(absent.body)).not.toContain(pass);
    expect(f.counts.meter).toBe(2);
  });
  it('never sends an over-budget RTC 2 batch response even when individual reads fit',async()=>{
    const fakeKeys=Array.from({length:36},(_,i)=>({
      kind:'project',project_id:'proj-'+String(i).padStart(4,'0'),
      last4:'FAKE',revoked_at:null
    }));
    const f=fixture({
      async listNeonOrgs(){return [{id:base.neon_org,label:'Fake organization',
        production_enabled:false}];},
      async listNeonKeySummaries(){return fakeKeys;}
    });
    const single=await f.post('neon_whoami',{});
    expect(single.statusCode).toBe(200);
    expect(Buffer.byteLength(JSON.stringify(single.body))).toBeLessThanOrEqual(8192);
    const batch=await f.post('_batch',{calls:Array.from({length:10},()=>({
      name:'neon_whoami',args:{}
    }))});
    expect(batch.statusCode).toBe(503);
    expect(batch.body).toMatchObject({ok:false,error:{code:'service_error'}});
    expect(batch.body).not.toHaveProperty('result');
    expect(Buffer.byteLength(JSON.stringify(batch.body))).toBeLessThanOrEqual(8192);
    expect(JSON.stringify(batch.body)).not.toContain('proj-0035');
    expect(f.counts.meter).toBe(2);
  });
  it('paginates caller-visible tools with total count, no schemas, bound cursors and terminal null',async()=>{
    const f=fixture(),names=[];
    let cursor,steps=0;
    do{
      const q={limit:'1',listing:'catalog'};
      if(cursor!==undefined)q.cursor=cursor;
      const res=await f.call('tools',q);
      expect(res.statusCode).toBe(200);
      expect(Buffer.byteLength(JSON.stringify(res.body))).toBeLessThanOrEqual(8192);
      expect(res.body.result.count).toBe(3);
      expect(res.body.result.tools).toHaveLength(1);
      expect(res.body.result.tools[0]).not.toHaveProperty('inputSchema');
      names.push(res.body.result.tools[0].name);
      cursor=res.body.result.next;
      steps++;
      expect(steps).toBeLessThan(8);
    }while(cursor!==null);
    expect(names.sort()).toEqual(['neon_get_settings','neon_where_is_setting','neon_whoami']);
  });
  it('rejects cursors after filter changes, changed passes and invalid forged values',async()=>{
    const f=fixture();
    const first=await f.call('tools',{limit:'1',listing:'catalog'});
    const cursor=first.body.result.next;
    expect(cursor).toEqual(expect.any(String));
    for(const q of [
      {limit:'1',listing:'catalog',cursor,q:'whoami'},
      {limit:'1',listing:'compact',cursor},
      {limit:'1',listing:'catalog',cursor:'forged'}
    ]){
      const res=await f.call('tools',q);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('invalid_args');
    }
    const other=await f.call('tools',{limit:'1',listing:'catalog',cursor},secondPass);
    expect(other.statusCode).toBe(400);
    expect(other.body.error.code).toBe('invalid_args');
    expect((await f.call('tools',{limit:'1',listing:'catalog'},'oauth_fake')).statusCode).toBe(401);
  });
  it('recovers exact canonical result bytes with 1-based pages and no reprojection',async()=>{
    const f=fixture(),handle='res_'+'b'.repeat(40),pages=[];
    let page=1;
    while(page!==null){
      const res=await f.call('results',{handle,page:String(page)});
      expect(res.statusCode).toBe(200);
      expect(Buffer.byteLength(JSON.stringify(res.body))).toBeLessThanOrEqual(8192);
      expect(res.body.result.page).toBe(page);
      expect(res.body.result.bytes).toBe(Buffer.byteLength(f.text));
      pages.push(res.body.result.content);
      page=res.body.result.next;
    }
    expect(pages.join('')).toBe(f.text);
    for(const bad of [{handle,page:'0'},{handle,page:'999'},{handle,fields:'items'},
      {handle,pageSize:'1'}]){
      const res=await f.call('results',bad);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('invalid_args');
    }
    const second=await f.call('results',{handle},secondPass);
    expect(second.statusCode).toBe(404);
    expect(second.body.error.code).toBe('not_found');
    const absent=fixture({async readResultHandle(){return null;}});
    expect((await absent.call('results',{handle})).statusCode).toBe(404);
    const legacy=fixture({async readResultHandle(){return {body:{items:[1,2]}};}});
    expect((await legacy.call('results',{handle})).statusCode).toBe(404);
  });
});
