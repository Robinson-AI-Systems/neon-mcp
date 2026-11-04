import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {generateCoverage} from '../../scripts/cap-coverage.mjs';
import {verifySdkDispatchRows,runSdkDispatch} from '../../scripts/cap-runtime-dispatch.mjs';
import {call} from '../../src/neon/client.js';
import {generateOperationMethods,verifySdkAliasWire,checkOperationMethods}
  from '../../scripts/verify-neon-method-guards.mjs';
import {neonMethod,NEON_OPERATION_METHODS} from '../../src/neon/operation-methods.js';

describe('CAP-1 installed runtime fake HTTP operation evidence (not provider acceptance)',()=>{
 it('prevents all 94 raw SDK mutations from bypassing the write flag or key',async()=>{
   const inv=generateCoverage().inventory;
   const candidate=inv.rows.filter(x=>
     x.sdkDispatch?.genericClientState==='raw-export'&&x.method!=='GET');
   expect(candidate).toHaveLength(94);
   const all=Object.entries(NEON_OPERATION_METHODS);
   expect(all).toHaveLength(214);
   expect(neonMethod('getConnectionUri')).toBe('GET');
   expect(neonMethod('addProjectJwks')).toBe('POST');
   expect(all.filter(([_,method])=>method!=='GET').length)
     .toBeGreaterThanOrEqual(candidate.length);
   expect(neonMethod('__proto__')).toBeNull();
   expect(neonMethod('unapprovedMethod')).toBeNull();
   expect(generateOperationMethods(inv)).toContain('"createProject":"POST"');
   let attempted=0,budget=0;
   const sdk=Object.fromEntries(['get','post','put','patch','delete']
     .map(method=>[method,async()=>{attempted++;return {data:{fake:true}}}]));
   const client={sdk,orgId:'fake',
     budget:{consume:async()=>{budget++;return {allowed:true}}},
     sleep:async()=>{}};
   for(const row of candidate){
     expect(neonMethod(row.operationId)).toBe(row.method);
     const path=Object.fromEntries(row.wire.parameters.filter(p=>p.in==='path')
       .map(p=>[p.name,'fake-'+p.name]));
     for(const opts of [{},{write:false},
       {write:false,requestKey:'fake_request_12345'}]){
       await expect(call(client,row.operationId,{path,body:{fake:true}},opts))
         .rejects.toThrow(/requires explicit write:true/);
     }
     await expect(call(client,row.operationId,{path,body:{fake:true}},
       {write:true})).rejects.toThrow(/request key/);
   }
   expect(budget).toBe(0);
   expect(attempted).toBe(0);
 });
 it('pins all twenty actual raw SDK capitalization aliases to exact fake method/path',async()=>{
   expect(await verifySdkAliasWire()).toBe(20);
   const result=await checkOperationMethods('--check');
   expect(result).toMatchObject({methodCount:214,pinnedOperationIds:194,
     caseAliases:20,providerVerified:false});
   expect(neonMethod('getProjectJwks')).toBe('GET');
   expect(neonMethod('createProjectBranchDataApi')).toBe('POST');
   expect(neonMethod('deleteProjectVpcEndpoint')).toBe('DELETE');
 });
 it('denies missing write intent for every mutating installed alias',async()=>{
   const inventory=generateCoverage().inventory;
   const rawIds=new Set(inventory.rows.filter(x=>x.sdkDispatch!==null)
     .map(x=>x.operationId));
   const aliases=Object.entries(NEON_OPERATION_METHODS).filter(
     ([name])=>!rawIds.has(name));
   expect(aliases).toHaveLength(20);
   let dispatched=0,consumed=0;
   const fake={sdk:Object.fromEntries(['get','post','patch','put','delete'].map(
     verb=>[verb,async()=>{dispatched++;return {data:{fake:true}}}])),
     orgId:'fake',sleep:async()=>{},
     budget:{consume:async()=>{consumed++;return {allowed:true}}}};
   for(const [name,method] of aliases){
     if(method==='GET')continue;
     await expect(call(fake,name,{path:{project_id:'fake'},body:{}},{write:false,
       requestKey:'fake_request_12345'})).rejects.toThrow(/requires explicit write:true/);
     await expect(call(fake,name,{path:{project_id:'fake'},body:{}},{write:true}))
       .rejects.toThrow(/request key/);
   }
   expect(dispatched).toBe(0);
   expect(consumed).toBe(0);
 });
 it('routes every callable installed SDK raw operation through one fake method/path and budget',async()=>{
   const result=await verifySdkDispatchRows(generateCoverage().inventory);
   expect(result.counts).toEqual({total:194,rawRouted:159,
     aliasRouted:17,fallbackStubbed:4,unavailableRejected:14,raw403Denied:159,alias403Denied:17,
     rawWrite503Unreplayed:94,aliasWrite503Unreplayed:10});
   expect(result.verifiedLiveProvider).toBe(false);
   expect(result.verifiedCredentials).toBe(false);
   expect(result.verifiedGuards).toBe(false);
   expect(result.verifiedRequestResponse).toBe(false);
   expect(result.rows.filter(x=>x.state==='synthetic-raw-http-routed')).toHaveLength(159);
   expect(result.rows.filter(x=>x.state==='synthetic-aliased-http-routed')).toHaveLength(17);
   expect(result.rows.filter(x=>x.state==='rejected-before-dispatch')).toHaveLength(14);
   expect(result.rows.filter(x=>x.synthetic403Denied)).toHaveLength(176);
   expect(result.rows.filter(x=>x.synthetic503Unreplayed)).toHaveLength(104);
   expect(result.rows.filter(x=>x.synthetic503Unreplayed&&x.method==='GET'))
     .toHaveLength(0);
   expect(result.rows.filter(x=>x.synthetic403Denied&&
     !['synthetic-raw-http-routed','synthetic-aliased-http-routed'].includes(x.state)))
     .toHaveLength(0);
   expect(generateCoverage().inventory.rows.every(x=>
     !x.source.tests.includes('tests/unit/cap-runtime-dispatch.test.js'))).toBe(true);
   expect(result.rows.every(x=>x.executionEvidence.includes('fake SDK only'))).toBe(true);
   expect(result.rows.every(x=>x.executionEvidence.includes('provider not contacted')))
     .toBe(true);
 });
 it('refuses to silently route unsupported operations or consume a call budget',async()=>{
   const rows=generateCoverage().inventory;
   const missing=rows.rows.filter(x=>x.sdkDispatch?.genericClientState===
     'no-dispatch-path');
   expect(missing).toHaveLength(14);
   expect(missing.some(x=>x.operationId==='listNeonAuthOAuthClients')).toBe(true);
   const output=await verifySdkDispatchRows(rows);
   expect(output.rows.filter(x=>x.state==='rejected-before-dispatch'))
     .toHaveLength(14);
   expect(output.rows.filter(x=>x.state==='synthetic-fallback-stub-invoked')
     .map(x=>x.operationId).sort())
     .toEqual(['addProjectJWKS','deleteProjectJWKS',
       'getProjectJWKS','recoverProjectBranch']);
 });
 it('detects tampered expected method/path, duplicate operation or claimed fallback',async()=>{
   const original=generateCoverage().inventory;
   const fake=structuredClone(original);
   fake.rows.find(x=>x.operationId==='getProject').path='/fake-mismatch';
   await expect(verifySdkDispatchRows(fake)).rejects.toThrow(/method\/path\/budget mismatch/i);
   const duplic=structuredClone(original);
   duplic.rows.push(structuredClone(duplic.rows.find(x=>x.operationId==='getProject')));
   await expect(verifySdkDispatchRows(duplic)).rejects.toThrow(/duplicate control-plane/i);
   const forged=structuredClone(original);
   forged.rows.find(x=>x.operationId==='getProjectJWKS').sdkDispatch.declaredFallback.flag=
      'fake-unknown-fallback';
   await expect(verifySdkDispatchRows(forged)).rejects.toThrow(/fallback stub mismatch/i);
   const fakePermission=structuredClone(original);
   fakePermission.sdkDispatch.withoutGenericDispatch=0;
   await expect(verifySdkDispatchRows(fakePermission)).rejects.toThrow(/denominator mismatch/i);
 });
 it('keeps generated source proof immutable and never upgrades real/live capability',async()=>{
   const outcome=await runSdkDispatch('--check');
   expect(outcome).toMatchObject({checked:true,total:194,rawRouted:159,
     aliasRouted:17,fallbackStubbed:4,unavailableRejected:14,raw403Denied:159,alias403Denied:17,
     rawWrite503Unreplayed:94,aliasWrite503Unreplayed:10,realProviderVerified:false});
   const stored=JSON.parse(readFileSync('docs/capabilities/sdk-runtime-dispatch.json','utf8'));
   expect(stored.verifiedLiveProvider).toBe(false);
   expect(stored.rows).toHaveLength(194);
   expect(stored.rows.every(x=>!Object.hasOwn(x,'authorization'))).toBe(true);
 });
});
