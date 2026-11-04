#!/usr/bin/env node
// Offline pinned control-plane method guard. Fake SDK transport only; no provider authority.
import * as raw from '@neon/sdk/raw';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateCoverage} from './cap-coverage.mjs';

const file=resolve(fileURLToPath(new URL('../src/neon/operation-methods.js',import.meta.url)));
const methods=['get','post','put','patch','delete'];
// These installed package exports construct clients; they are NOT API operations.
const nonOperations=new Set(['createClient','createConfig','wrapRaw']);
function checkedMethodData(inventory){
  if(!Array.isArray(inventory?.rows)||!inventory?.sdkDispatch)
    throw new TypeError('Checked source operation inventory required');
  const seen=new Map(),rows=new Map();
  for(const row of inventory.rows){
    if(row.sdkDispatch===null)continue;
    if(!/^[A-Za-z][A-Za-z0-9]*$/.test(row.operationId)||
       !['GET','POST','PUT','PATCH','DELETE'].includes(row.method))
      throw new TypeError('Unknown method or operation identifier');
    const previous=seen.get(row.operationId);
    if(previous&&previous!==row.method)
      throw new TypeError('Conflicting method declarations for '+row.operationId);
    seen.set(row.operationId,row.method);
    rows.set(row.operationId,row);
  }
  if(seen.size!==inventory.sdkDispatch.total)
    throw new TypeError('Missing or duplicate pinned SDK operation methods');
  const aliases=[];
  for(const rawName of Object.keys(raw).filter(name=>
    typeof raw[name]==='function'&&!nonOperations.has(name)).sort()){
    if(seen.has(rawName))continue;
    const canonical=[...seen.keys()].filter(name=>
      name.toLowerCase()===rawName.toLowerCase());
    if(canonical.length!==1)
      throw new TypeError('Unpinned installed SDK raw operation '+rawName);
    const record=rows.get(canonical[0]);
    // A canonical SDK-reference ID can be absent while an installed raw
    // export with different acronym casing is callable. Only the independently
    // verified fake transport method/path may authorize that *alias* in --check.
    if(!record)
      throw new TypeError('SDK case alias without a source operation '+rawName);
    aliases.push({alias:rawName,canonical:canonical[0],
      method:record.method,path:record.path});
  }
  if(aliases.length!==20)
    throw new TypeError('Pinned installed SDK case-alias count drift');
  for(const row of aliases)seen.set(row.alias,row.method);
  return {seen,aliases};
}
export function generateOperationMethods(inventory=generateCoverage().inventory){
  const {seen,aliases}=checkedMethodData(inventory);
  const records=[...seen].sort((a,b)=>a[0].localeCompare(b[0]));
  return [
    '// GENERATED from checked Neon OpenAPI and installed SDK raw export aliases.',
    '// To update: node scripts/verify-neon-method-guards.mjs --write',
    '// Every mutating method is guarded independently of caller write opts.',
    `// ${seen.size-aliases.length} pinned operation IDs; ${aliases.length} verified case aliases.`,
    'export const NEON_OPERATION_METHODS=Object.freeze({',
    ...records.map(([operationId,method])=>`  ${JSON.stringify(operationId)}:${JSON.stringify(method)},`),
    '});',
    '// Canonical provider operation IDs mapped to fake-wire-verified SDK raw export casing.',
    'export const NEON_CANONICAL_RAW_ALIASES=Object.freeze({',
    ...aliases.sort((a,b)=>a.canonical.localeCompare(b.canonical))
      .map(({canonical,alias})=>`  ${JSON.stringify(canonical)}:${JSON.stringify(alias)},`),
    '});',
    'export function neonRawCaseAlias(operationId){',
    '  return Object.hasOwn(NEON_CANONICAL_RAW_ALIASES,operationId)',
    '    ? NEON_CANONICAL_RAW_ALIASES[operationId] : null;',
    '}',
    'export function neonMethod(operationId){',
    '  return Object.hasOwn(NEON_OPERATION_METHODS,operationId)',
    '    ? NEON_OPERATION_METHODS[operationId] : null;',
    '}',
    ''
  ].join('\n');
}
export async function verifySdkAliasWire(inventory=generateCoverage().inventory){
  const {aliases}=checkedMethodData(inventory);
  for(const alias of aliases){
    const seen=[];
    const sdk=Object.fromEntries(methods.map(method=>[method,async opts=>{
      seen.push({method:method.toUpperCase(),url:opts.url});
      return {data:{fake:true},response:{status:200}};
    }]));
    let result;
    try{
      result=await raw[alias.alias]({client:sdk,
        path:{project_id:'fake',branch_id:'fake',org_id:'fake'},
        body:{fake:true}});
    }catch{
      throw new TypeError('Installed SDK alias failed fake HTTP invocation: '+alias.alias);
    }
    if(!result?.data||seen.length!==1||seen[0].method!==alias.method||
       seen[0].url!==alias.path)
      throw new TypeError('Installed SDK case alias method/path drift: '+alias.alias);
  }
  return aliases.length;
}
export async function checkOperationMethods(mode){
  if(mode!=='--write'&&mode!=='--check')throw new TypeError('Expected --write or --check');
  const inventory=generateCoverage().inventory;
  const source=generateOperationMethods(inventory);
  const aliases=await verifySdkAliasWire(inventory);
  if(mode==='--write')writeFileSync(file,source);
  else if(readFileSync(file,'utf8')!==source)
    throw new TypeError('Checked runtime SDK operation method guard drift');
  return {methodCount:194+aliases,pinnedOperationIds:194,caseAliases:aliases,
    source:'pinned Neon SDK + installed raw export case aliases',providerVerified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  checkOperationMethods(process.argv[2]).then(x=>console.log(JSON.stringify(x)))
    .catch(e=>{console.error(e.message);process.exitCode=1});
}
