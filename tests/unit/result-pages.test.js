import {it,expect} from 'vitest';
import {pageStoredResult} from '../../src/core/result-pages.js';
import {publicToolMetadata,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {registry} from '../../src/tools/index.js';
const connection={clientId:'fake-client',neonOrg:'org-fake',projectScope:null,
 mode:'preview',profile:'read_only'};
it('returns all items in deterministic bounded pages',()=>{
 const data={projects:Array.from({length:22},(_,i)=>({id:'fake-'+i,name:'item-'+i}))};
 const first=pageStoredResult(data,{page:0,pageSize:10});
 const last=pageStoredResult(data,{page:2,pageSize:10});
 expect(first).toMatchObject({format:'items',source:'projects',total:22,nextPage:1});
 expect(last.items).toHaveLength(2);expect(last.nextPage).toBeNull();
 const projected=pageStoredResult(data,{page:0,fields:'projects'});
 expect(projected.source).toBe('projects');
});
it('returns lossless encoded fragments for oversized objects or list items',()=>{
 const body={str:'✨'.repeat(4000)};
 const pages=[];
 for(let page=0;;page++){
  const p=pageStoredResult(body,{page});
  expect(p.format).toBe('base64-json-fragment');
  pages.push(Buffer.from(p.fragment,'base64'));
  if(p.nextPage===null)break;
 }
 expect(JSON.parse(Buffer.concat(pages).toString('utf8'))).toEqual(body);
 const giant={records:[{data:'a'.repeat(9000)}]};
 expect(pageStoredResult(giant,{page:0}).format).toBe('base64-json-fragment');
});
it('rejects unsafe projections, oversized/invalid page sizes and negative offsets',()=>{
 const body={items:[{id:'fake'}]};
 for(const opts of [{page:-1},{page:1.1},{pageSize:0},{pageSize:51}])
  expect(()=>pageStoredResult(body,opts)).toThrow();
 expect(()=>pageStoredResult(body,{fields:'__proto__.toString'})).toThrow();
});
it('adds MCP annotations from immutable metadata and structured safe retrieval',async()=>{
 const tool=registry.tools.find(t=>t.name==='neon_get_result');
 expect(publicToolMetadata(tool).annotations).toEqual({
  readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
 const write=registry.tools.find(t=>t.name==='neon_update_settings');
 expect(publicToolMetadata(write).annotations.readOnlyHint).toBe(false);
 let called=null;
 const fakeDb={readResultHandle:async args=>{
  called=args;return {summary:'fake records',body:{rows:[{id:'fake-row'}]}};}};
 const handle='res_'+'d'.repeat(40);
 const result=await dispatchReadOnlyTool({registry,name:'neon_get_result',
  args:{handle},connection,db:fakeDb,env:{VERCEL_ENV:'preview'}});
 expect(result.isError).toBe(false);
 expect(result.structuredContent).toMatchObject({handle,page:0,total:1});
 expect(JSON.stringify(result)).not.toContain('secret');
 expect(called.connection).toMatch(/^[a-f0-9]{64}$/);
});
it('does not return another connection handle even when identifier matches',async()=>{
 const handle='res_'+'b'.repeat(40);
 let seen;
 const db={readResultHandle:async args=>{seen=args;return null;}};
 const unavailable=await dispatchReadOnlyTool({registry,name:'neon_get_result',
  args:{handle},connection:{...connection,clientId:'other-client'},db,env:{VERCEL_ENV:'preview'}});
 expect(unavailable.isError).toBe(true);
 expect(unavailable.structuredContent).toBeUndefined();
 expect(seen.connection).toMatch(/^[a-f0-9]{64}$/);
});
