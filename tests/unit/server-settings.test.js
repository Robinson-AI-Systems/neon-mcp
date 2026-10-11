import {it,expect} from 'vitest';
import {tools,handlers} from '../../src/tools/server-settings.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {registry} from '../../src/tools/index.js';
const read=res=>JSON.parse(res.content[0].text);
function fixture(){
 let current=5000,writes=0;
 const audit=[];
 const db={
 getNeonOrg:async id=>id==='org-fake'?{id}:null,
 getEncryptedNeonKey:async({kind})=>kind==='org'?{id:3,key_enc:'never returned'}:null,
 listSafeSettings:async()=>[{key:'spend.cap_per_day_cents',value:current}],
 updateTightenedSetting:async({prior,value})=>{if(current!==prior)return false;current=value;writes++;return true;},
 recordWritePreview:async row=>{audit.push({...row,dry:true});return audit.length;},
 reserveWrite:async row=>{audit.push({...row,confirmed:'pending'});return {created:true,id:audit.length};},
 completeWrite:async({id,confirmed})=>{audit[id-1].confirmed=confirmed;return true;}
 };
 return {db,audit,get writes(){return writes},get current(){return current},
 connection:{neonOrg:'org-fake',clientId:'owner',profile:'full',mode:'preview'},
 env:{VERCEL_ENV:'production'}};
}
it('declares a complete restricted access-control write contract',()=>{
 expect(tools[0]).toMatchObject({name:'neon_update_settings',writes:true,
 writeContract:'defineWrite-v1',access:true,key:'org',profiles:['full'],productionEffect:'none'});
});
it('previews, confirms only a reduction, and verifies the stored value',async()=>{
 const f=fixture(),args={setting:'spend.cap_per_day_cents',value:4500};
 const dry=read(await handlers.neon_update_settings({...args,dryRun:true},f));
 expect(dry.needsConfirmation).toBe(true);expect(f.writes).toBe(0);
 expect(read(await handlers.neon_update_settings(args,f)).code).toBe('needs_confirmation');
 expect(f.writes).toBe(0);
 expect(read(await handlers.neon_update_settings({...args,confirm:true},f)).confirmed).toBe(true);
 expect(f.current).toBe(4500);expect(f.writes).toBe(1);
 expect(JSON.stringify(f.audit)).not.toContain('key_enc');
});
it('refuses raising limits, protected list changes, wrong scope and preview deployment',async()=>{
 const f=fixture();
 for(const args of [
  {setting:'spend.cap_per_day_cents',value:6000,confirm:true},
  {setting:'protected_resources',value:[],confirm:true},
  {setting:'pricing',value:{},confirm:true}]){
  expect((await handlers.neon_update_settings(args,f)).isError).toBe(true);
 }
 for(const bad of [
  {...f,connection:{...f.connection,projectScope:'proj-other'}},
  {...f,env:{VERCEL_ENV:'preview'}},
  {...f,connection:{...f.connection,profile:'read_only'}}]){
  expect((await dispatchReadOnlyTool({registry,name:'neon_update_settings',
   args:{setting:'spend.cap_per_day_cents',value:4000,confirm:true},...bad})).isError).toBe(true);
 }
 expect(f.writes).toBe(0);
});
