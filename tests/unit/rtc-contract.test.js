import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {rtcManifest,rtcCatalog,rtcOpenApi,rtcError,rtcToolMetadata} from '../../src/core/rtc-contract.js';
import contractRoute from '../../api/contract.js';
const response=()=>({
  headers:{},setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.code=n;return this;},json(value){this.body=value;return this;}
});
describe('RTC 1 contract foundation (before pass-bearing HTTPS activation)',()=>{
 it('derives exact prefixed counts and semantics from the active registry',()=>{
  const manifest=rtcManifest(registry);
  expect(manifest).toMatchObject({rtc:1,prefix:'neon',
    counts:{tools:registry.tools.length},devTools:false});
  expect(manifest.counts.writes).toBe(registry.tools.filter(t=>t.writes===true).length);
  expect(manifest.counts.money).toBe(registry.tools.filter(t=>t.money===true).length);
  for(const t of registry.tools){
    const data=rtcToolMetadata(t);
    expect(data.name.startsWith('neon_')).toBe(true);
    expect(data.annotations.readOnlyHint).toBe(!t.writes);
    expect(data.annotations.destructiveHint).toBe(t.destructive===true);
    expect(data.description.length).toBeLessThanOrEqual(160);
    if(t.writes===false){
      expect(data.inputSchema.properties.fields).toMatchObject({
        type:'string',maxLength:512});
      expect(data.inputSchema.properties.detail).toMatchObject({
        type:'string',enum:['summary','full']});
    }else expect(data.inputSchema).toEqual(t.inputSchema||{
      type:'object',properties:{}});
  }
 });
 it('never discloses a full-profile-only operation through a read_only pass listing',()=>{
  const safe={profile:'read_only',listing:'catalog',mode:'preview',neonOrg:'org-fake'};
  const tools=rtcCatalog(registry,safe,{limit:100},{VERCEL_ENV:'production'});
  expect(tools.length).toBeGreaterThan(0);
  expect(tools.every(t=>t.writes===false && t.profiles.includes('read_only'))).toBe(true);
  expect(tools.every(t=>t.name.startsWith('neon_'))).toBe(true);
  expect(rtcCatalog(registry,safe,{listing:'compact',limit:100},
    {VERCEL_ENV:'production'}).length).toBeLessThanOrEqual(tools.length);
  expect(rtcCatalog(registry,safe,{q:'definitely missing',limit:10},
    {VERCEL_ENV:'production'})).toEqual([]);
 });
 it('rejects oversized, invalid and forged discovery metadata',()=>{
  const connection={profile:'read_only',listing:'compact'};
  for(const opt of [{limit:101},{limit:0},{limit:-1},{audience:'root'},
    {q:'x'.repeat(161)},{area:'z'.repeat(81)}])
   expect(()=>rtcCatalog(registry,connection,opt)).toThrow();
  expect(()=>rtcToolMetadata({name:'other_read',writes:false,
    description:'Read',profiles:['read_only']})).toThrow();
 });
 it('has a bounded 3.1 OpenAPI shape and uniform RTC errors',()=>{
  const spec=rtcOpenApi();
  expect(spec.openapi).toBe('3.1.0');
  const count=Object.values(spec.paths).reduce((n,path)=>n+Object.keys(path)
    .filter(x=>['get','post','put','patch','delete'].includes(x)).length,0);
  expect(count).toBeGreaterThan(0);expect(count).toBeLessThanOrEqual(30);
  expect(rtcError('pass_revoked',{status:401}).body.error).toMatchObject({
    code:'pass_revoked',what:expect.any(String),cause:expect.any(String),
    todo:expect.any(String),technical:expect.any(String)});
 });
 it('does not advertise RTC 1 on an unproven HTTPS surface by default',()=>{
  const prior=process.env.RTC1_ENABLED;
  delete process.env.RTC1_ENABLED;
  try{const res=response();contractRoute({method:'GET'},res);
    expect(res.code).toBe(503);expect(res.body.rtc).toBeUndefined();
    const denied=response();contractRoute({method:'POST'},denied);
    expect(denied.code).toBe(405);
  }finally{
    if(prior===undefined)delete process.env.RTC1_ENABLED;
    else process.env.RTC1_ENABLED=prior;
  }
 });
});
