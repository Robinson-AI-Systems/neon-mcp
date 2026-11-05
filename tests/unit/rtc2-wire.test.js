import {describe,it,expect} from 'vitest';
import {rtc2CatalogPage,rtc2ContentPage,RTC2_REPLY_BYTES} from '../../src/core/rtc2-wire.js';

const scope='f'.repeat(64);
const filters={query:'branch',area:'projects',audience:'builder',listing:'catalog'};
const tools=Array.from({length:250},(_,i)=>({name:'neon_tool_'+i,
  description:'Find existing project branch operations',area:'projects',
  writes:false,money:false,audience:['builder','owner']}));
describe('RTC 2 cursor discovery',()=>{
  it('returns all scoped entries with total count, an opaque cursor, terminal null and no schemas',()=>{
    let cursor,seen=[],pages=0;
    do{
      const response=rtc2CatalogPage({items:tools,passBinding:scope,filters,limit:100,cursor});
      expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThanOrEqual(RTC2_REPLY_BYTES);
      expect(response.result.count).toBe(250);
      expect(response.result.tools.length).toBeGreaterThan(0);
      for(const item of response.result.tools)expect(item).not.toHaveProperty('inputSchema');
      seen.push(...response.result.tools.map(x=>x.name)); cursor=response.result.next;
      pages++;
      expect(pages).toBeLessThan(50);
    }while(cursor!==null);
    expect(seen).toEqual(tools.map(x=>x.name));
    expect(pages).toBeGreaterThan(2);
  });
  it('refuses changed grant, filter, listing, invalid cursor, and fabricated offset',()=>{
    const cursor=rtc2CatalogPage({items:tools,passBinding:scope,filters,limit:5}).result.next;
    for(const patch of [{passBinding:'a'.repeat(64)},{filters:{...filters,area:'compute'}},
      {filters:{...filters,listing:'compact'}},{cursor:'abc'},
      {cursor:cursor.replace(/.$/,'0')}]){
      expect(()=>rtc2CatalogPage({items:tools,passBinding:scope,filters,limit:5,cursor,...patch})).toThrow();
    }
    expect(()=>rtc2CatalogPage({items:tools,passBinding:scope,filters,limit:0})).toThrow();
  });
  it('never silently clips a very large listing item',()=>{
    expect(()=>rtc2CatalogPage({items:[{name:'neon_bad',description:'A'.repeat(10000)}],
      passBinding:scope,filters})).toThrow(/describe/);
  });
});
describe('RTC 2 content pages',()=>{
  const handle='res_'+'1'.repeat(40);
  it('reconstructs JSON text exactly, including Unicode and escaped text, with 1-based pages',()=>{
    const text=JSON.stringify({title:'👋 測試',details:'\\\\n'.repeat(9000),values:Array.from({length:50},(_,i)=>'🙂'+i)});
    let parts=[],next=1,expectedPages;
    while(next!==null){
      const response=rtc2ContentPage({handle,text,page:next});
      expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThanOrEqual(RTC2_REPLY_BYTES);
      expect(response.result.bytes).toBe(Buffer.byteLength(text));
      expectedPages=response.result.pages;
      parts.push(response.result.content);
      next=response.result.next;
    }
    expect(parts.length).toBe(expectedPages);
    expect(parts.join('')).toBe(text);
    expect(()=>rtc2ContentPage({handle,text,page:0})).toThrow();
    expect(()=>rtc2ContentPage({handle,text,page:parts.length+1})).toThrow();
  });
  it('accepts empty canonical text and refuses another handle shape',()=>{
    expect(rtc2ContentPage({handle,text:''}).result).toMatchObject({page:1,pages:1,bytes:0,content:'',next:null});
    expect(()=>rtc2ContentPage({handle:'res_public',text:'{}'})).toThrow();
  });
});

describe('RTC 2 pass-specific result scopes',()=>{
  it('refuses the same saved handle across passes sharing one client identity',async()=>{
    const {resultScope}=await import('../../src/core/result-store.js');
    const base={clientId:'same-client',neonOrg:'same-org',
      projectScope:'same-project',mode:'preview',profile:'read_only'};
    expect(resultScope({...base,rtcResultGrant:'a'.repeat(64)}))
      .not.toBe(resultScope({...base,rtcResultGrant:'b'.repeat(64)}));
    expect(resultScope(base)).not.toBe(resultScope({...base,rtcResultGrant:'a'.repeat(64)}));
    expect(()=>resultScope({...base,rtcResultGrant:'public-input'})).toThrow();
  });
});
