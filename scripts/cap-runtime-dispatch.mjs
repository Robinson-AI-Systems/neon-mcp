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
       !['raw-export','case-alias-export','fallback-declared','no-dispatch-path'].includes(
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
    let synthetic403Denied=false;
    let synthetic503Unreplayed=false;
    if(state==='raw-export'||state==='case-alias-export'){
      if(error||output?.confirmed!==true||seenCalls.length!==1||
         fallbacks.length!==0||budget.count!==1||
         seenCalls[0].method!==row.method.toLowerCase()||
         seenCalls[0].url!==row.path||
         JSON.stringify(seenCalls[0].path??{})!==JSON.stringify(path))
        throw new TypeError('Installed SDK fake HTTP method/path/budget mismatch: '+row.operationId);
      // Real installed SDK wrapper, simulated 403, no provider grant or
      // external network. A denial must be sanitized and never retried.
      const refusals=[];let refusalBudget=0;
      const denySdk=Object.fromEntries(methods.map(method=>[method,
        async opts=>{
          refusals.push({method,url:opts.url});
          return {error:{status:403,message:'CAP1_FAKE_SECRET_MUST_NOT_APPEAR'},
            response:{status:403,headers:{get:()=>null}}};
        }]));
      const denial=await dispatch({...client,sdk:denySdk,
        budget:{consume:async()=>{refusalBudget++;return {allowed:true}}}},
        row.operationId,params,{write:row.method!=='GET',requestKey:key});
      if(denial?.confirmed!==false||denial?.error?.code!=='not_authorized'||
         denial?.error?.status!==403||
         JSON.stringify(denial).includes('CAP1_FAKE_SECRET_MUST_NOT_APPEAR')||
         refusals.length!==1||refusalBudget!==1||
         refusals[0].method!==row.method.toLowerCase()||
         refusals[0].url!==row.path)
        throw new TypeError('Installed SDK synthetic 403 denial leaked or retried: '+row.operationId);
      synthetic403Denied=true;
      if(row.method!=='GET'){
        // Simulate an ambiguous server failure. Only one mutating request
        // may go out; the wrapper may do its bounded read-only recovery
        // lookup but must never silently repeat the write.
        const uncertainCalls=[];let uncertainBudget=0;
        const uncertainSdk=Object.fromEntries(methods.map(method=>[method,
          async opts=>{
            uncertainCalls.push({method,url:opts.url});
            return method==='get'?
              {data:{branches:[],operations:[]},response:{status:200}}:
              {error:{status:503,message:'CAP1_FAKE_SECRET_MUST_NOT_APPEAR'},
                response:{status:503,headers:{get:()=>null}}};
          }]));
        const uncertain=await dispatch({...client,sdk:uncertainSdk,
          budget:{consume:async()=>{uncertainBudget++;return {allowed:true}}}},
          row.operationId,params,{write:true,requestKey:key});
        const writes=uncertainCalls.filter(x=>x.method!=='get');
        if(uncertain?.confirmed!==null||uncertain?.error?.code!=='unknown_outcome'||
           JSON.stringify(uncertain).includes('CAP1_FAKE_SECRET_MUST_NOT_APPEAR')||
           writes.length!==1||writes[0].method!==row.method.toLowerCase()||
           writes[0].url!==row.path||
           uncertainCalls.length>2||uncertainBudget<1||uncertainBudget>2)
          throw new TypeError('Installed SDK synthetic 503 write replay/leak: '+row.operationId);
        synthetic503Unreplayed=true;
      }
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
        state==='case-alias-export'?'synthetic-aliased-http-routed':
        state==='fallback-declared'?'synthetic-fallback-stub-invoked':
          'rejected-before-dispatch',
      // No real request/response or provider authorization was observed.
      executionEvidence:'in-process fake SDK only; provider not contacted',
      synthetic403Denied,synthetic503Unreplayed
    });
  }
  const counts={
    total:results.length,
    rawRouted:results.filter(x=>x.state==='synthetic-raw-http-routed').length,
    aliasRouted:results.filter(x=>x.state==='synthetic-aliased-http-routed').length,
    fallbackStubbed:results.filter(x=>x.state==='synthetic-fallback-stub-invoked').length,
    unavailableRejected:results.filter(x=>x.state==='rejected-before-dispatch').length,
    raw403Denied:results.filter(x=>x.state==='synthetic-raw-http-routed'&&x.synthetic403Denied).length,
    alias403Denied:results.filter(x=>x.state==='synthetic-aliased-http-routed'&&x.synthetic403Denied).length,
    rawWrite503Unreplayed:results.filter(x=>x.state==='synthetic-raw-http-routed'&&x.synthetic503Unreplayed).length,
    aliasWrite503Unreplayed:results.filter(x=>x.state==='synthetic-aliased-http-routed'&&x.synthetic503Unreplayed).length
  };
  const expected=inventory.sdkDispatch;
  if(counts.total!==expected.total||counts.rawRouted!==expected.rawExport||
     counts.aliasRouted!==expected.aliasedExport||
     counts.fallbackStubbed!==expected.fallbackOnly||
     counts.unavailableRejected!==expected.withoutGenericDispatch||
     counts.raw403Denied!==expected.rawExport||
     counts.alias403Denied!==expected.aliasedExport||
     counts.rawWrite503Unreplayed!==results.filter(x=>
       x.state==='synthetic-raw-http-routed'&&x.method!=='GET').length||
     counts.aliasWrite503Unreplayed!==results.filter(x=>
       x.state==='synthetic-aliased-http-routed'&&x.method!=='GET').length)
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
