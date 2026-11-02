import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkDocCodeTruth, activeDocs } from './check-doc-code-truth.mjs';

const files = Object.fromEntries(activeDocs.map(p=>[p,readFileSync(resolve(p),'utf8')]));
const exists = p => existsSync(resolve(p));

test('current docs agree with actual endpoint files, card counts, RTC adoption state and release checkpoint', () => {
  assert.deepEqual(checkDocCodeTruth({ files, exists }), []);
});
test('a removed route and stale card count independently fail instead of silently passing', () => {
  const gone = checkDocCodeTruth({ files, exists:p => p !== 'api/oauth/revoke.js' && exists(p) });
  assert.ok(gone.some(e => e.includes('api/oauth/revoke.js')));
  const stale = checkDocCodeTruth({ files:{...files,'README.md':files['README.md'].replace('58 tracked original/CAP','53 tracked original/CAP')}, exists});
  assert.ok(stale.some(e => e.includes('card count')));
});
test('unimplemented RTC 2 is never represented by a documentation-only adoption', () => {
  const inaccurate = checkDocCodeTruth({ files:{...files,'docs/DIRECT-MCP-CONNECTION.md':files['docs/DIRECT-MCP-CONNECTION.md'].replace('not yet implemented','already fully accepted')}, exists});
  assert.ok(inaccurate.some(e => e.includes('RTC 2')));
});
