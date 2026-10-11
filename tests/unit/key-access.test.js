import {it,expect} from 'vitest';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {registry} from '../../src/tools/index.js';
it('owner key probe unavailable on preview and on read-only/everyday profiles',async()=>{
 const db={getNeonOrg:async()=>({id:'org-fake'}),
   listNeonKeySummaries:async()=>{throw new Error('must not read keys');}};
 for(const [profile,env] of [['full',{VERCEL_ENV:'preview'}],
   ['read_only',{VERCEL_ENV:'production'}],['everyday',{VERCEL_ENV:'production'}]]){
  const res=await dispatchReadOnlyTool({registry,name:'neon_check_key_access',
   args:{},connection:{neonOrg:'org-fake',profile,mode:'preview'},env,db});
  expect(res.isError).toBe(true);
 }
});

it('refuses a full-profile project-restricted connection before reading organization keys',async()=>{
 const db={getNeonOrg:async()=>{throw new Error('scope leaked');}};
 const out=await dispatchReadOnlyTool({registry,name:'neon_check_key_access',
  connection:{neonOrg:'org-fake',projectScope:'project-fake',profile:'full',mode:'preview'},
  env:{VERCEL_ENV:'production'},db,args:{}});
 expect(out.isError).toBe(true);
});
