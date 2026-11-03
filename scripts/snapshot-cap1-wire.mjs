#!/usr/bin/env node
// Local-only, explicit regeneration from full SHA-verified upstream raw JSON.
// Never fetches online, changes runtime vendor or authorizes provider requests.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {projectOpenApiContracts,contractDigest,
  verifiedOfficialWireRaw} from '../src/core/cap-api-contract.js';
import {verifyOfficialSdkRaw} from '../src/core/cap-coverage.js';
const source=process.argv[2];
if(!source)throw new TypeError('Usage: node scripts/snapshot-cap1-wire.mjs FULL_PINNED_UPSTREAM_JSON');
const ref=JSON.parse(readFileSync('docs/capabilities/current-control-plane.json','utf8'));
const raw=readFileSync(resolve(source),'utf8');
verifyOfficialSdkRaw(ref,raw);
const contracts=projectOpenApiContracts(JSON.parse(raw));
const snapshot={schemaVersion:1,revision:ref.source.revision,
  sourceSha256:ref.source.sha256,operationDigest:ref.operationDigest,
  contractDigest:contractDigest(contracts),contracts};
verifiedOfficialWireRaw(ref,snapshot,raw);
const skeleton=JSON.stringify({...snapshot,contracts:[]},null,2);
const compact=skeleton.replace('"contracts": []',
  '"contracts": [\n    '+contracts.map(x=>JSON.stringify(x)).join(',\n    ')+'\n  ]')+'\n';
writeFileSync('docs/capabilities/current-control-plane-contracts.json',compact);
console.log(JSON.stringify({contracts:contracts.length,
  digest:snapshot.contractDigest,sourceVerified:true}));
