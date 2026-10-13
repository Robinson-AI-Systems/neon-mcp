import {it,expect} from 'vitest';
import {resultScope,bufferOversizeResult,sqlRowsCompact,RESULT_MAX_BYTES} from '../../src/core/result-store.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
const connection={clientId:'fake-connector-a',neonOrg:'org-fake',
 projectScope:'proj-fake',mode:'preview',profile:'read_only'};
it('scopes by immutable authenticated identity and rejects absent scope',()=>{
 expect(resultScope(connection)).toMatch(/^[a-f0-9]{64}$/);
 for(const patch of [{clientId:'another'},{neonOrg:'org-other'},
  {projectScope:'proj-other'},{profile:'full'},{mode:'production'}])
   expect(resultScope({...connection,...patch})).not.toBe(resultScope(connection));
 expect(()=>resultScope({clientId:'a'})).toThrow();
});
it('stores a secret-free 24-hour result only when oversized and returns a compact handle',async()=>{
 const saved=[],db={saveResultHandle:async row=>{saved.push(row);return row;}};
 const big={projects:Array.from({length:150},(_,i)=>({name:'item-'+i,
  description:'x'.repeat(120),password:'FAKE_secret_never_persist'}))};
 const out=await bufferOversizeResult({db,connection,toolName:'neon_test',value:big});
 expect(out.buffered).toBe(true);
 expect(Buffer.byteLength(JSON.stringify(out.value))).toBeLessThan(RESULT_MAX_BYTES);
 expect(out.value.handle).toMatch(/^res_[a-f0-9]{40}$/);
 expect(saved).toHaveLength(1);
 expect(JSON.stringify(saved)).not.toContain('FAKE_secret_never_persist');
 expect(saved[0].expiresAt.getTime()-Date.now()).toBeGreaterThan(86000000);
 const small=await bufferOversizeResult({db,connection,toolName:'neon_test',value:{id:'safe'}});
 expect(small.buffered).toBe(false);expect(saved).toHaveLength(1);
});
it('fails closed without scope/database or for extremely large result',async()=>{
 const value={records:Array.from({length:100},()=>({data:'a'.repeat(150)}))};
 await expect(bufferOversizeResult({db:{},connection,toolName:'test',value})).rejects.toThrow();
 await expect(bufferOversizeResult({db:{saveResultHandle:async()=>{}},
  connection:{},toolName:'test',value})).rejects.toThrow();
 await expect(bufferOversizeResult({db:{saveResultHandle:async()=>{}},
  connection,toolName:'test',value:{text:'x'.repeat(3*1024*1024)}})).rejects.toThrow();
});
it('keeps columns once, caps SQL rows and text without mutation',()=>{
 const rows=[{id:1,comment:'long'.repeat(300)},{id:2,comment:'okay'}];
 const out=sqlRowsCompact(rows,{rowCap:1,cellChars:25});
 expect(out.columns).toEqual(['id','comment']);expect(out.rows).toHaveLength(1);
 expect(out.rows[0][1]).toContain('[cell shortened]');expect(out.truncated).toBe(true);
 expect(rows[0].comment).toHaveLength(1200);
 expect(()=>sqlRowsCompact(rows,{rowCap:10001})).toThrow();
});
it('buffers through the actual MCP dispatcher and never returns more than 8 KB',async()=>{
 const db={saved:[],async saveResultHandle(row){this.saved.push(row);}};
 const registry={tools:[{name:'neon_big_read',writes:false,profiles:['read_only']}],
  handlers:{neon_big_read:async()=>({content:[{type:'text',text:JSON.stringify({
   data:Array.from({length:140},(_,i)=>({name:'fake-'+i,description:'z'.repeat(150),
    api_key:'napi_FAKE_SECRET_MUST_HIDE'}))})}]})}};
 const out=await dispatchReadOnlyTool({db,registry,name:'neon_big_read',
  connection,env:{VERCEL_ENV:'preview'},args:{detail:'full'}});
 expect(out.isError).toBe(false);
 expect(Buffer.byteLength(out.content[0].text)).toBeLessThan(RESULT_MAX_BYTES);
 expect(db.saved).toHaveLength(1);
 expect(JSON.stringify(db.saved)).not.toContain('FAKE_SECRET_MUST_HIDE');
});

it('sanitizes an asynchronous result-store failure inside the actual MCP dispatcher',async()=>{
  const marker='napi_FAKE_STORAGE_EXCEPTION_NOT_FOR_CLIENT';
  let stored=0;
  const db={async saveResultHandle(){
    stored++;await Promise.resolve();throw new Error(marker);
  }};
  const registry={tools:[{name:'neon_storage_read',writes:false,profiles:['read_only']}],
    handlers:{neon_storage_read:async()=>({content:[{type:'text',text:JSON.stringify({
      records:Array.from({length:160},(_,i)=>({id:i,note:'z'.repeat(150)}))
    })}]})}};
  const response=await dispatchReadOnlyTool({registry,name:'neon_storage_read',
    connection,db,env:{VERCEL_ENV:'production'},args:{detail:'full'}});
  expect(stored).toBe(1);
  expect(response).toEqual({isError:true,content:[{type:'text',
    text:'Could not read account details; check server setup'}]});
  expect(JSON.stringify(response)).not.toContain(marker);
});

it('turns result-size and projection errors into stable MCP failures without storage or leaks',async()=>{
  const marker='napi_FAKE_SHOULD_NOT_REACH_CLIENT';
  const registry={tools:[{name:'neon_guarded_read',writes:false,profiles:['read_only']}],
    handlers:{neon_guarded_read:async()=>({content:[{type:'text',text:JSON.stringify({
      entries:Array.from({length:25},()=>({value:'x'.repeat(100000)})),api_key:marker
    })}]})}};
  const db={async saveResultHandle(){throw Error('Must not save oversized results');}};
  for(const args of [{detail:'full'},{fields:'__proto__.constructor'}]){
    const response=await dispatchReadOnlyTool({registry,name:'neon_guarded_read',
      connection,db,env:{VERCEL_ENV:'production'},args});
    expect(response.isError).toBe(true);
    expect(response.content).toEqual([{type:'text',
      text:'Could not read account details; check server setup'}]);
    expect(JSON.stringify(response)).not.toContain(marker);
  }
});
