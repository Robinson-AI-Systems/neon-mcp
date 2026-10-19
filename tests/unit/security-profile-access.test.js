import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {isToolAllowed} from '../../src/core/profiles.js';
import {listVisibleToolMetadata,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {rtcCatalog} from '../../src/core/rtc-contract.js';

const approved=['neon_security_set_public_access',
 'neon_security_set_ip_allow','neon_security_set_jwks',
 'neon_security_set_audit_log_level'];
const full={clientId:'fake-client',neonOrg:'org-fake-owner',
 profile:'full',listing:'catalog',mode:'preview'};
const prod={VERCEL_ENV:'production'};
const preview={VERCEL_ENV:'preview'};

describe('D-8 user-delegated source-guarded owner security access',()=>{
 it('registers only the four reviewed D-8 project-security writes for a full owner on a production deployment',()=>{
  const listed=listVisibleToolMetadata({registry,connection:full,env:prod,listing:'catalog'});
  const catalog=rtcCatalog(registry,full,{listing:'catalog',limit:100},prod);
  for(const name of approved){
   const item=registry.tools.find(t=>t.name===name);
   expect(item).toMatchObject({name,writes:true,writeContract:'defineWrite-v1',
    profiles:['full'],area:'security'});
   expect(typeof registry.handlers[name]).toBe('function');
   expect(listed.some(t=>t.name===name)).toBe(true);
   expect(catalog.some(t=>t.name===name)).toBe(true);
   expect(isToolAllowed(item,full,{productionDeployment:true})).toBe(true);
  }
  expect(listed.some(t=>t.name==='neon_security_set_logical_replication')).toBe(false);
  expect(isToolAllowed({
   name:'neon_security_set_logical_replication',profiles:['full'],writes:true
  },full,{productionDeployment:true})).toBe(false);
 });
 it('refuses every reviewed security write under a read-only, everyday or preview-deployment connection',async()=>{
  for(const name of approved){
   const item=registry.tools.find(t=>t.name===name);
   let calls=0;
   const scoped={tools:[item],handlers:{[name]:async()=>{
    calls++;
    return {content:[{type:'text',text:JSON.stringify({done:false,
     preview:'Existing guarded owner-only operation'})}]};
   }}};
   const accepted=await dispatchReadOnlyTool({registry:scoped,name,
    connection:full,db:{},env:prod});
   expect(accepted.isError).toBe(false);
   expect(calls).toBe(1);
   for(const [profile,env] of [['read_only',prod],['everyday',prod],
    ['full',preview]]){
    const connection={...full,profile};
    const listed=listVisibleToolMetadata({registry:scoped,connection,env,listing:'catalog'});
    expect(listed.some(x=>x.name===name)).toBe(false);
    const denied=await dispatchReadOnlyTool({registry:scoped,name,connection,
     db:{},env});
    expect(denied.isError).toBe(true);
    expect(calls).toBe(1);
   }
  }
 });
 it('does not treat the RTC temporary pass profile or forged tool metadata as permission',()=>{
  const readOnly={...full,profile:'read_only'};
  expect(rtcCatalog(registry,readOnly,{listing:'catalog',limit:100},prod)
   .some(x=>approved.includes(x.name))).toBe(false);
  expect(isToolAllowed({name:'neon_security_unknown_action',
   writes:true,profiles:['full']},full,{productionDeployment:true})).toBe(false);
 });
});
