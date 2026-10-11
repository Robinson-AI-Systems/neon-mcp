#!/usr/bin/env node
// Read-only public description diff. Do not overwrite or silently re-vendor the pinned spec.
import fs from 'node:fs';
import {parse} from 'yaml';
import {indexNeonOperations,diffNeonOperations} from '../src/neon/openapi-index.js';
const pinned=indexNeonOperations(parse(fs.readFileSync(new URL('../vendor/neon-openapi/v2.yaml',import.meta.url),'utf8')));
const url=new URL(process.argv[2] || 'https://neon.com/api_spec/release/v2.json');
if(url.protocol!=='https:'||url.hostname!=='neon.com'||url.pathname!=='/api_spec/release/v2.json'||
  url.search||url.hash) throw new Error('Only the official public Neon API description URL is allowed');
try {
  const response=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok) throw new Error('HTTP '+response.status);
  const size=Number(response.headers.get('content-length')||0);
  if(size>12000000) throw new Error('Description too large');
  const body=await response.text();
  if(body.length>12000000) throw new Error('Description too large');
  const live=indexNeonOperations(parse(body));
  console.log(JSON.stringify({pinned:pinned.length,live:live.length,...diffNeonOperations(pinned,live)},null,2));
} catch(error) {
  console.error('Could not compare descriptions: '+error.message);
  process.exitCode=2;
}
