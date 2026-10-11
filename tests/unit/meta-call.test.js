import {describe,it,expect,vi} from 'vitest';
import {registry as allTools} from '../../src/tools/index.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
const invoke=(registry,name,args,connection={profile:'read_only',neonOrg:'org-fake',projectScope:'proj-one'})=>
 dispatchReadOnlyTool({registry,name,args,connection,db:{},env:{VERCEL_ENV:'preview'}});
describe('C-2 guarded neon_call meta-door',()=>{
 it('invokes the wrapped read handler and scrubs secrets',async()=>{
  const called=vi.fn(async (args,ctx)=>({content:[{type:'text',text:JSON.stringify({
   received:args.id,project:ctx.connection.projectScope,token:'napi_FAKE_SAMPLE',name:'safe'})}]}));
  const meta=allTools.tools.find(t=>t.name==='neon_call');
  const fake={tools:[meta,{name:'neon_safe',writes:false,profiles:['read_only']}],
   handlers:{neon_call:allTools.handlers.neon_call,neon_safe:called}};
  const r=await invoke(fake,'neon_call',{name:'neon_safe',args:{id:'fake'}});
  expect(r.isError).not.toBe(true);
  expect(called).toHaveBeenCalledOnce();
  const json=JSON.stringify(r);
  expect(json).toContain('proj-one');
  expect(json).toContain('fake');
  expect(json).not.toContain('FAKE_SAMPLE');
 });
 it('cannot invoke a restricted write, even when name is known',async()=>{
  const called=vi.fn(async()=>({content:[{type:'text',text:'{"ok":true}'}]}));
  const meta=allTools.tools.find(t=>t.name==='neon_call');
  const fake={tools:[meta,{name:'neon_secret_write',writes:true,profiles:['full']}],
   handlers:{neon_call:allTools.handlers.neon_call,neon_secret_write:called}};
  const out=await invoke(fake,'neon_call',{name:'neon_secret_write',args:{}});
  expect(out.isError).toBe(true);
  expect(called).not.toHaveBeenCalled();
 });
 it('rejects nested recursion, malformed args and an unavailable name',async()=>{
  for(const name of ['neon_call','neon_batch','neon_missing']){
   const out=await invoke(allTools,'neon_call',{name,args:{}});
   expect(out.isError).toBe(true);
  }
  expect((await invoke(allTools,'neon_call',{name:'neon_whoami',args:[]})).isError).toBe(true);
 });
 it('uses the direct caller scope in both paths without widening permissions',async()=>{
  const ctx={profile:'full',neonOrg:'org-fake',projectScope:'proj-one',mode:'production'};
  const r=await dispatchReadOnlyTool({registry:allTools,name:'neon_call',
   args:{name:'neon_enable_production',args:{}},connection:ctx,db:{},
   env:{VERCEL_ENV:'preview'}});
  expect(r.isError).toBe(true);
 });
});
