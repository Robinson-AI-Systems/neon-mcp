#!/usr/bin/env node
// CAP-1: run real installed SDK wrappers against a FAKE in-memory HTTP client.
// No provider credentials, remote network, account, or product permissions used.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {call} from '../src/neon/client.js';
import {generateCoverage} from './cap-coverage.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const destination=resolve(root,'docs/capabilities/sdk-runtime-dispatch.json');
const methods=['get','post','put','patch','delete'];
const fallbackMethod={recoverBranch:'recoverBranch',jwksRead:'getProjectJWKS',
  jwksAdd:'addProjectJWKS',jwksDelete:'deleteProjectJWKS'};
const key='cap1-synthetic-request-1234';
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export async function verifySdkDispatchRows(inventory,{dispatch=call}={}){
  if(!Array.isArray(inventory?.rows)||!isObject(inventory.sdkDispatch)||
     typeof dispatch!=='function')
    throw new TypeError('A checked CAP-1 inventory and invocation are required');
  const rows=inventory.rows.filter(x=>x.sdkDispatch!==null);
  const seen=new Set(),results=[];
  for(const row of rows){
    if(!isObject(row.sdkDispatch)||!isObject(row.wire)||
       !['raw-export','fallback-declared','no-dispatch-path'].includes(
         row.sdkDispatch.genericClientState)||
       seen.has(row.operationId))
      throw new TypeError('Malformed or duplicate control-plane runtime proof row');
    seen.add(row.operationId);
    const path=Object.fromEntries(row.wire.parameters.filter(p=>p.in==='path')
      .map(p=>[p.name,'cap1-'+p.name.replaceAll('_','-')]));
    const params={path,query:{},body:{fake:true}};
    const seenCalls=[],budget={count:0},fallbacks=[];
    const sdk={};
    for(const method of methods)
      sdk[method]=async opts=>{
        seenCalls.push({method,url:opts.url,path:opts.path});
        return {data:{fake:true,operations:[]},response:{status:200}};
      };
    const client={sdk,orgId:'cap1-fake-org',sleep:async()=>{},
      budget:{consume:async()=>{budget.count++;return {allowed:true}}}};
    for(const prop of Object.values(fallbackMethod))
      client[prop]=async(...args)=>{
        fallbacks.push({prop,args});
        return {data:{fake:true,operations:[]}};
      };
    let output,error;
    try{
      output=await dispatch(client,row.operationId,params,
        {write:row.method!=='GET',requestKey:key});
    }catch(e){error=e}
    const state=row.sdkDispatch.genericClientState;
    if(state==='raw-export'){
      if(error||output?.confirmed!==true||seenCalls.length!==1||
         fallbacks.length!==0||budget.count!==1||
         seenCalls[0].method!==row.method.toLowerCase()||
         seenCalls[0].url!==row.path||
         JSON.stringify(seenCalls[0].path??{})!==JSON.stringify(path))
        throw new TypeError('Installed SDK fake HTTP method/path/budget mismatch: '+row.operationId);
    }else if(state==='fallback-declared'){
      const method=fallbackMethod[row.sdkDispatch.declaredFallback?.flag];
      if(!method||error||output?.confirmed!==true||seenCalls.length!==0||
         fallbacks.length!==1||fallbacks[0].prop!==method||
         budget.count!==1||
         JSON.stringify(fallbacks[0].args[0])!==JSON.stringify(path))
        throw new TypeError('SDK guarded fallback stub mismatch: '+row.operationId);
    }else{
      if(!error||!String(error.message).includes('not supported by the pinned SDK')||
         seenCalls.length!==0||fallbacks.length!==0||budget.count!==0)
        throw new TypeError('Unsupported SDK method reached fake client or budget: '+row.operationId);
    }
    results.push({
      operationId:row.operationId,method:row.method,path:row.path,
      origin:row.origin,
      state:state==='raw-export'?'synthetic-raw-http-routed':
        state==='fallback-declared'?'synthetic-fallback-stub-invoked':
          'rejected-before-dispatch',
      // No real request/response or provider authorization was observed.
      executionEvidence:'in-process fake SDK only; provider not contacted'
    });
  }
  const counts={
    total:results.length,
    rawRouted:results.filter(x=>x.state==='synthetic-raw-http-routed').length,
    fallbackStubbed:results.filter(x=>x.state==='synthetic-fallback-stub-invoked').length,
    unavailableRejected:results.filter(x=>x.state==='rejected-before-dispatch').length
  };
  const expected=inventory.sdkDispatch;
  if(counts.total!==expected.total||counts.rawRouted!==expected.rawExport||
     counts.fallbackStubbed!==expected.fallbackOnly||
     counts.unavailableRejected!==expected.withoutGenericDispatch)
    throw new TypeError('Checked SDK static/dynamic dispatch denominator mismatch');
  return {schemaVersion:1,source:'installed @neon/sdk/raw with in-memory fake HTTP client',
    sdkVersion:expected.version,
    vendoredSha256:inventory.controlPlane.sha256,
    officialSdkSourceSha256:inventory.currentControlPlane.sourceSha256,
    wireSnapshotDigest:inventory.wireContracts.officialDigest,
    verifiedLiveProvider:false,verifiedCredentials:false,verifiedGuards:false,
    verifiedRequestResponse:false,verifiedReadback:false,
    counts,rows:results};
}
export async function runSdkDispatch(mode){
  if(!['--check','--write'].includes(mode))
    throw new TypeError('Use --check or --write');
  const generated=await verifySdkDispatchRows(generateCoverage().inventory);
  const artifact=JSON.stringify(generated,null,2)+'\n';
  if(mode==='--write')writeFileSync(destination,artifact);
  else if(readFileSync(destination,'utf8')!==artifact)
    throw new TypeError('CAP-1 live SDK fake-route proof drift; regenerate and review');
  return {checked:mode==='--check',...generated.counts,sdkVersion:generated.sdkVersion,
    realProviderVerified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runSdkDispatch(process.argv[2]).then(x=>console.log(JSON.stringify(x)))
    .catch(e=>{console.error(e.message);process.exitCode=1});
}
