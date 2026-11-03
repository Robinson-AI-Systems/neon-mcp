#!/usr/bin/env node
// Deterministic CAP-1 source/authority map. No network or provider calls.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'yaml';
import {registry} from '../src/tools/index.js';
import * as neonRaw from '@neon/sdk/raw';
import {verifiedSourcePin,buildCapabilityInventory,validateCapabilityInventory,
  formatCapabilityGapReport} from '../src/core/cap-coverage.js';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const file=path=>readFileSync(resolve(root,path),'utf8');
const outputPath='docs/capabilities/operation-coverage.json';
const reportPath='docs/capabilities/CAP-1-REPORT.md';
function sources(folder){
  const dir=resolve(root,folder),files={};
  if(!existsSync(dir))return files;
  for(const name of readdirSync(dir).sort()){
    const full=join(dir,name);
    if(!name.endsWith('.js')&&!name.endsWith('.mjs'))continue;
    files[relative(root,full).replaceAll('\\','/')]=readFileSync(full,'utf8');
  }
  return files;
}
export function generateCoverage(){
  const specText=file('vendor/neon-openapi/v2.yaml');
  const sourceText=file('vendor/neon-openapi/SOURCE.md');
  const spec=parse(specText),sourcePin=verifiedSourcePin({specText,sourceText});
  const productSurfaces=JSON.parse(file('docs/capabilities/neon-product-surfaces.json'));
  const currentControlPlane=JSON.parse(file('docs/capabilities/current-control-plane.json'));
  const officialWireSnapshot=JSON.parse(file('docs/capabilities/current-control-plane-contracts.json'));
  const testFiles={...sources('tests/unit'),...sources('tests/db'),...sources('tests/integration')};
  // Inventory's own assertions mention operation IDs but are not behavioral tests.
  delete testFiles['tests/unit/cap-coverage.test.js'];
  const sourceFiles=sources('src/tools');
  const clientSource=file('src/neon/client.js');
  const sdkVersion=JSON.parse(file('package.json')).dependencies['@neon/sdk'];
  const sdkRawOperationNames=Object.keys(neonRaw).filter(name=>
    typeof neonRaw[name]==='function').sort();
  const inventory=buildCapabilityInventory({spec,sourcePin,
    sourceFiles,testFiles,registry,productSurfaces,
    currentControlPlane,checkedDate:productSurfaces.checkedDate,
    sdkRawOperationNames,clientSource,sdkVersion,officialWireSnapshot});
  validateCapabilityInventory({inventory,spec,sourcePin,registry,productSurfaces,
    currentControlPlane,sourceFiles,sdkRawOperationNames,clientSource,sdkVersion,officialWireSnapshot});
  // One record per line: reviewable and machine-readable, without a huge
  // pretty-printed six-way credential matrix per operation.
  const skeleton=JSON.stringify({...inventory,rows:[]},null,2);
  const lines=inventory.rows.map(row=>JSON.stringify(row)).join(',\n    ');
  const artifact=skeleton.replace('"rows": []',
    '"rows": [\n    '+lines+'\n  ]')+'\n';
  return {inventory,artifact,report:formatCapabilityGapReport(inventory),sourceFiles,
    sdkRawOperationNames,clientSource,sdkVersion};
}
export function runCoverage(mode){
  if(!['--check','--write'].includes(mode))
    throw new TypeError('Use --check or --write');
  const generated=generateCoverage();
  if(mode==='--write'){
    writeFileSync(resolve(root,outputPath),generated.artifact);
    writeFileSync(resolve(root,reportPath),generated.report);
  }else{
    if(file(outputPath)!==generated.artifact||file(reportPath)!==generated.report)
      throw new TypeError('CAP-1 schema, registry or coverage artifacts drifted: regenerate and review');
  }
  return {checked:mode==='--check',api:generated.inventory.controlPlane.expectedOperations,
    sdk:generated.inventory.currentControlPlane.expectedOperations,
    sdkNew:generated.inventory.currentControlPlane.newToPinned,
    sdkOld:generated.inventory.currentControlPlane.pinnedOnly,
    advanced:generated.inventory.externalSurfaces.count,
    tools:generated.inventory.registry.registeredTools,
    sdkDispatch:generated.inventory.sdkDispatch};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(runCoverage(process.argv[2]??'--check')));}
  catch(error){console.error('CAP-1: '+error.message);process.exitCode=1;}
}
