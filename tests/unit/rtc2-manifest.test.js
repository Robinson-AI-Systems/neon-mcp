import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {rtcManifest,rtc2Manifest} from '../../src/core/rtc-contract.js';
import {serverRelease} from '../../src/core/server-release.js';
import {createContractHandler} from '../../api/contract.js';
import {MCP_TECHNICAL_ID} from '../../src/core/product-identity.js';

const commit='a'.repeat(40);
const env={PUBLIC_BASE_URL:'https://neon.example.test',
  VERCEL_GIT_COMMIT_SHA:commit,RTC1_ENABLED:'1'};
function response(){return {headers:{},statusCode:200,body:null,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(v){this.statusCode=v;return this;},
  json(v){this.body=v;return this;}};}
describe('RTC 2 manifest projection (unadvertised until complete adoption)',()=>{
  it('uses exact normative dialect, truthful deployed revision and live registry counts',()=>{
    const release=serverRelease(env);
    const result=rtc2Manifest(registry,{env});
    const legacy=rtcManifest(registry,{release});
    expect(result).toMatchObject({
      rtc:2,server:MCP_TECHNICAL_ID,prefix:'neon_',
      revision:commit,version:release.version,
      listing:{pagination:'cursor',maxLimit:100,replyBudgetBytes:8192},
      results:{recovery:'content-pages',handleTtlSeconds:86400,pageBudgetBytes:8192},
      auth:{passes:true,oauth:{issuer:env.PUBLIC_BASE_URL,
        protectedResource:env.PUBLIC_BASE_URL+'/api/mcp'}},
      connection:env.PUBLIC_BASE_URL+'/connection',
      health:'/api/health',devTools:false
    });
    expect(result.counts).toEqual(legacy.counts);
    expect(result.areas).toEqual(legacy.areas);
    expect(result.profiles).toEqual(legacy.profiles);
    expect(result.listingModes).toEqual(['catalog','compact']);
    expect(result.modes).toEqual(['preview','production']);
    expect(result.counts.tools).toBe(registry.tools.length);
    expect(result.counts.writes).toBe(registry.tools.filter(t=>t.writes).length);
  });
  it('refuses missing/malformed deployment SHA and insecure or absent canonical origin',()=>{
    for(const revision of [undefined,'not-a-sha','A'.repeat(40)]){
      const bad={...env,VERCEL_GIT_COMMIT_SHA:revision};
      expect(()=>rtc2Manifest(registry,{env:bad})).toThrow();
    }
    for(const base of [undefined,'http://neon.example.test',
      'https://neon.example.test/untrusted']){
      expect(()=>rtc2Manifest(registry,{env:{...env,PUBLIC_BASE_URL:base}})).toThrow();
    }
  });
  it('does not publicly advertise RTC 2 even with a known source revision',()=>{
    const handler=createContractHandler({env});
    const res=response();
    handler({method:'GET'},res);
    expect(res.statusCode).toBe(200);
    expect(res.body.rtc).toBe(1);
    expect(res.body.prefix).toBe('neon');
    expect(res.body.listing?.pagination).not.toBe('cursor');
  });
});
