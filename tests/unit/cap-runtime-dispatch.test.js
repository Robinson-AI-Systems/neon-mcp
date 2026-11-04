import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {generateCoverage} from '../../scripts/cap-coverage.mjs';
import {verifySdkDispatchRows,runSdkDispatch} from '../../scripts/cap-runtime-dispatch.mjs';

describe('CAP-1 installed runtime fake HTTP operation evidence (not provider acceptance)',()=>{
 it('routes every callable installed SDK raw operation through one fake method/path and budget',async()=>{
   const result=await verifySdkDispatchRows(generateCoverage().inventory);
   expect(result.counts).toEqual({total:194,rawRouted:159,
     fallbackStubbed:4,unavailableRejected:31,raw403Denied:159,
     rawWrite503Unreplayed:94});
   expect(result.verifiedLiveProvider).toBe(false);
   expect(result.verifiedCredentials).toBe(false);
   expect(result.verifiedGuards).toBe(false);
   expect(result.verifiedRequestResponse).toBe(false);
   expect(result.rows.filter(x=>x.state==='synthetic-raw-http-routed')).toHaveLength(159);
   expect(result.rows.filter(x=>x.synthetic403Denied)).toHaveLength(159);
   expect(result.rows.filter(x=>x.synthetic503Unreplayed)).toHaveLength(94);
   expect(result.rows.filter(x=>x.synthetic503Unreplayed&&x.method==='GET'))
     .toHaveLength(0);
   expect(result.rows.filter(x=>x.synthetic403Denied&&x.state!=='synthetic-raw-http-routed'))
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
   expect(missing).toHaveLength(31);
   expect(missing.some(x=>x.operationId==='listNeonAuthOAuthClients')).toBe(true);
   const output=await verifySdkDispatchRows(rows);
   expect(output.rows.filter(x=>x.state==='rejected-before-dispatch'))
     .toHaveLength(31);
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
     fallbackStubbed:4,unavailableRejected:31,raw403Denied:159,
     rawWrite503Unreplayed:94,realProviderVerified:false});
   const stored=JSON.parse(readFileSync('docs/capabilities/sdk-runtime-dispatch.json','utf8'));
   expect(stored.verifiedLiveProvider).toBe(false);
   expect(stored.rows).toHaveLength(194);
   expect(stored.rows.every(x=>!Object.hasOwn(x,'authorization'))).toBe(true);
 });
});
