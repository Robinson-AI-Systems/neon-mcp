import {describe,it,expect} from 'vitest';
import {scrubNeonResult,scrubAuditRow,redactNeonText} from '../../src/neon/scrub.js';
import {localTime,shapeResult} from '../../src/core/result-rules.js';
import {isToolAllowed,profileToolCounts} from '../../src/core/profiles.js';
import {dispatchReadOnlyTool,listVisibleToolMetadata} from '../../src/core/mcp-server.js';
import {registry} from '../../src/tools/index.js';
describe('B-6 deep secret removal',()=>{
  it('drops secret fields across project/branch/role/key/credential provider shapes and protects text',()=>{
    const v={project:{connection_uris:['postgresql://user:pw@localhost/db'],create:{api_token:'fake',
      key:'napi_FAKE_TESTKEY',role:{password:'npg_FAKE_TESTPASS',email:'owner@example.test'}}},
      nested:[{secret_server_key:'fake',s3_secret_access_key:'fake',
        message:'postgresql://user:FAKE_PASS@localhost/db napi_FAKE_TESTKEY',
        url:'https://localhost/x?X-Amz-Signature=fake'}]};
    const text=JSON.stringify(scrubNeonResult(v));
    expect(scrubNeonResult({key:'raw-opaque-key',label:'safe'})).toEqual({label:'safe'});
    for(const s of ['FAKE_TESTPASS','FAKE_TESTKEY','FAKE_PASS','X-Amz','s3_secret','api_token'])expect(text).not.toContain(s);
    expect(text).toContain('owner@example.test');
    expect(redactNeonText('bearer fake-access')).not.toContain('fake-access');
  });
  it('removes personal snapshots from audit and refuses circular output',()=>{
    const v={id:'safe-1',email:'test@example.test',before:{id:'prj-safe',email:'x@y.test',password:'bad'},
      after:{id:'prj-safe',connection_uri:'bad'},secret:'x'};
    expect(scrubAuditRow(v)).toEqual({id:'safe-1',before:{id:'prj-safe'},after:{id:'prj-safe'}});
    const cyc={id:'x'};cyc.self=cyc;
    expect(JSON.stringify(scrubNeonResult(cyc))).toContain('hidden circular');
  });
});
describe('B-6 display and connection profiles',()=>{
  it('presents money, sizes and local Denver dates on both sides of DST',()=>{
    expect(localTime('2026-03-08T08:59:59Z')).toContain('MST');
    expect(localTime('2026-03-08T09:00:00Z')).toContain('MDT');
    expect(shapeResult({spend_cents:2500,storage_bytes:1073741824,updated_at:'2026-03-08T09:00:00Z'}))
      .toMatchObject({spend_cents_display:'$25.00',storage_bytes_display:'1.00 GB'});
  });
  it('does not expose writes by listing or direct name in read_only or preview deployment',async()=>{
    const write=registry.tools.find(t=>t.name==='neon_disable_production');
    expect(isToolAllowed(write,{profile:'read_only'},{productionDeployment:true})).toBe(false);
    expect(isToolAllowed(write,{profile:'full'},{productionDeployment:false})).toBe(false);
    expect(isToolAllowed({...write,name:'neon_undocumented_write'},{profile:'full'},{productionDeployment:true})).toBe(false);
    expect(isToolAllowed({name:'neon_org_read',writes:false,key:'org',profiles:['read_only','full']},
      {profile:'read_only'})).toBe(false);
    const counts=profileToolCounts(registry.tools,{productionDeployment:true});
    expect(counts).toEqual({read_only:50,everyday:58,full:122});
    const snapshots=['neon_snapshot_create','neon_snapshot_update',
      'neon_snapshot_delete','neon_snapshot_restore','neon_snapshot_set_schedule'];
    for(const name of snapshots){
      const item=registry.tools.find(t=>t.name===name);
      expect(item).toMatchObject({writes:true,writeContract:'defineWrite-v1',
        profiles:['full'],area:'snapshots'});
      expect(isToolAllowed(item,{profile:'full'},{productionDeployment:true})).toBe(true);
      for(const profile of ['everyday','read_only'])
        expect(isToolAllowed(item,{profile},{productionDeployment:true})).toBe(false);
      expect(isToolAllowed(item,{profile:'full'},{productionDeployment:false})).toBe(false);
    }
    const full={profile:'full',neonOrg:'org-fake',listing:'catalog'};
    const visible=listVisibleToolMetadata({registry,connection:full,
      listing:'catalog',env:{VERCEL_ENV:'production'}});
    for(const name of snapshots)expect(visible.some(t=>t.name===name)).toBe(true);
    for(const name of snapshots){
      let invoked=0;
      const item=registry.tools.find(t=>t.name===name);
      const scoped={tools:[item],handlers:{[name]:async()=>{
        invoked++;return {content:[{type:'text',text:JSON.stringify({done:false,
          preview:'Owner guarded operation; no provider mutation'})}]};
      }}};
      const allowed=await dispatchReadOnlyTool({registry:scoped,name,
        connection:full,db:{},env:{VERCEL_ENV:'production'}});
      expect(allowed.isError).toBe(false);
      expect(invoked).toBe(1);
      for(const options of [
        {connection:{...full,profile:'everyday'},env:{VERCEL_ENV:'production'}},
        {connection:{...full,profile:'read_only'},env:{VERCEL_ENV:'production'}},
        {connection:full,env:{VERCEL_ENV:'preview'}}
      ]){
        const blocked=await dispatchReadOnlyTool({registry:scoped,name,
          connection:options.connection,env:options.env,db:{}});
        expect(blocked.isError).toBe(true);
        expect(invoked).toBe(1);
      }
    }
    const denied=await dispatchReadOnlyTool({registry,name:'neon_disable_production',args:{},
      connection:{profile:'read_only',mode:'preview',neonOrg:'org-fake'},db:{},env:{VERCEL_ENV:'production'}});
    expect(denied.isError).toBe(true);
  });
  it('scrubs returned handler content before MCP boundary',async()=>{
    const fake={tools:[{name:'neon_whoami',writes:false,profiles:['read_only']}],
      handlers:{neon_whoami:async()=>({content:[{type:'text',
        text:JSON.stringify({id:'safe',nested:{password:'fake-pass',api_token:'fake-token'}})}]})}};
    const out=await dispatchReadOnlyTool({registry:fake,name:'neon_whoami',connection:{profile:'read_only'},
      db:{},env:{VERCEL_ENV:'preview'}});
    expect(out.content[0].text).toContain('"id":"safe"');
    expect(out.content[0].text).not.toContain('fake-pass');
    expect(out.structuredContent).toBeUndefined();
  });
});
