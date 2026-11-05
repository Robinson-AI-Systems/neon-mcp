#!/usr/bin/env node
// Offline byte-exact upstream reference verification. No network/provider calls.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {verifyOfficialSdkRaw} from '../src/core/cap-coverage.js';
import {verifiedOfficialWireRaw} from '../src/core/cap-api-contract.js';

export function verifyReference(reference,wireSnapshot,raw){
  const methods=verifyOfficialSdkRaw(reference,raw);
  const wire=verifiedOfficialWireRaw(reference,wireSnapshot,raw);
  return {...methods,wireContracts:wire.operations,wireDigest:wire.digest};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)throw new TypeError(
      'Pass a locally downloaded official commit-pinned Neon SDK spec JSON path');
    const ref=JSON.parse(readFileSync('docs/capabilities/current-control-plane.json','utf8'));
    const snapshot=JSON.parse(readFileSync(
      'docs/capabilities/current-control-plane-contracts.json','utf8'));
    console.log(JSON.stringify(verifyReference(ref,snapshot,
      readFileSync(process.argv[2],'utf8'))));
  }catch(e){console.error('CAP-1 SDK reference: '+e.message);process.exitCode=1;}
}
