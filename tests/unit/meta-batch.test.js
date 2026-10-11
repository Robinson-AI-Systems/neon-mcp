import {describe,it,expect,vi} from 'vitest';
import {registry as live} from '../../src/tools/index.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
const batch=live.tools.find(t=>t.name==='neon_batch');
const read=(name,handler)=>({name,writes:false,profiles:['read_only','everyday','full'],handler});
const context={profile:'read_only',neonOrg:'org-fake',projectScope:'proj-one',listing:'compact'};
const invoke=(registry,calls,connection=context)=>dispatchReadOnlyTool({
 registry,name:'neon_batch',args:{calls},connection,db:{},env:{VERCEL_ENV:'preview'}});
describe('C-2 read-only batch preflight and isolation',()=>{
 it('runs ordered, scoped read calls and scrubs every nested result',async()=>{
  const seen=[];
  const a=vi.fn(async (args,ctx)=>{seen.push([args.id,ctx.connection.projectScope]);
   return {content:[{type:'text',text:JSON.stringify({value:args.id,password:'fake-leak'})}]};});
  const registry={tools:[batch,read('neon_read_one'),read('neon_read_two')],
   handlers:{neon_batch:live.handlers.neon_batch,neon_read_one:a,neon_read_two:a}};
  const r=await invoke(registry,[{name:'neon_read_one',args:{id:1}},
   {name:'neon_read_two',args:{id:2}}]);
  expect(r.isError).not.toBe(true);
  expect(seen).toEqual([[1,'proj-one'],[2,'proj-one']]);
  expect(JSON.stringify(r)).not.toContain('fake-leak');
 });
 it('rejects entire batch with a write before executing any read',async()=>{
  const spy=vi.fn(async()=>({content:[{type:'text',text:'{"ok":true}'}]}));
  const registry={tools:[batch,read('neon_read_one'),{name:'neon_write_one',writes:true,
   profiles:['full']}],handlers:{neon_batch:live.handlers.neon_batch,
    neon_read_one:spy,neon_write_one:spy}};
  const r=await invoke(registry,[{name:'neon_read_one'},{name:'neon_write_one'}],
   {...context,profile:'full'});
  expect(r.isError).toBe(true);
  expect(spy).not.toHaveBeenCalled();
 });
 it('refuses nested meta dispatch, inaccessible names, and more than ten calls',async()=>{
  for(const calls of [
   [{name:'neon_batch',args:{calls:[]}}],
   [{name:'neon_call',args:{name:'neon_whoami',args:{}}}],
   [{name:'neon_update_settings'}],
   [{name:'neon_missing'}],
   Array.from({length:11},()=>({name:'neon_whoami'}))
  ])expect((await invoke(live,calls)).isError).toBe(true);
 });
 it('never elevates project or organization context between calls',async()=>{
  const spy=vi.fn(async (_args,ctx)=>({content:[{type:'text',
   text:JSON.stringify({project:ctx.connection.projectScope})}]}));
  const registry={tools:[batch,read('neon_scoped')],handlers:{
   neon_batch:live.handlers.neon_batch,neon_scoped:spy}};
  const result=await invoke(registry,[{name:'neon_scoped'}],context);
  expect(JSON.stringify(result)).toContain('proj-one');
  expect(spy).toHaveBeenCalledOnce();
 });
});
