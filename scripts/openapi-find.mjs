#!/usr/bin/env node
// Local read-only operation lookup; never contacts the Neon service.
import fs from 'node:fs';
import { parse } from 'yaml';
import { indexNeonOperations,searchNeonOperations } from '../src/neon/openapi-index.js';
const spec=parse(fs.readFileSync(new URL('../vendor/neon-openapi/v2.yaml',import.meta.url),'utf8'));
const query=process.argv.slice(2).join(' ').trim();
if(!query){
  console.error('Usage: node scripts/openapi-find.mjs <method/path/operationId/words>');
  process.exitCode=2;
} else {
  for(const item of searchNeonOperations(indexNeonOperations(spec),query))
    console.log([item.method,item.path,item.operationId,item.summary].join(' | '));
}
