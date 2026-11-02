// Prevent current product docs from silently drifting from the implemented route surface.
// Historical dated design notes are deliberately not treated as present-tense claims.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = path => readFileSync(resolve(root, path), 'utf8');

export function checkDocCodeTruth({ files, exists }) {
  const errors = [];
  const index = JSON.parse(files['docs/pr-cards/work-index.json']);
  const count = index.cards.length;
  const cap = index.cards.filter(card => card.batch === 'CAP');
  const gates = index.completionGates || [];
  const requiredRoutes = [
    ['api/mcp.js', 'docs/DIRECT-MCP-CONNECTION.md', '/api/mcp'],
    ['api/oauth/revoke.js', 'docs/ARCHITECTURE.md', '/api/oauth/revoke'],
    ['src/core/oauth-revocation.js', 'docs/DIRECT-MCP-CONNECTION.md', '/api/oauth/revoke'],
    ['api/contract.js', 'docs/START-HERE.md', 'contract.js'],
    ['api/rtc.js', 'docs/START-HERE.md', 'rtc.js'],
    ['api/openapi.json.js', 'docs/START-HERE.md', 'openapi.json.js']
  ];
  for (const [source, doc, token] of requiredRoutes) {
    if (!exists(source)) errors.push('Implemented route missing: ' + source);
    if (!files[doc]?.includes(token)) errors.push(doc + ': missing route reference ' + token);
  }
  if (!files['README.md'].includes(`${count} tracked original/CAP work cards`)) {
    errors.push('README: original/CAP card count disagrees with index');
  }
  if (!files['docs/MASTER-ROADMAP.md'].includes('CAP-1–CAP-5') || cap.length !== 5) {
    errors.push('Master roadmap: CAP backlog incomplete or undocumented');
  }
  if (gates.length !== 6 || !files['docs/COMPLETION-GATES.md'].includes('CG-1')) {
    errors.push('Cross-cutting completion gates are missing');
  }
  if (!files['docs/HUB-COMPATIBILITY.md'].includes('RTC 2 adoption') ||
      !files['docs/PLAN.md'].includes('RTC 2 successor status')) {
    errors.push('Adopted RTC 2 successor missing from current compatibility and plan');
  }
  if (!files['docs/HUB-COMPATIBILITY.md'].includes('changes no current behavior') ||
      !files['docs/DIRECT-MCP-CONNECTION.md'].includes('not yet implemented')) {
    errors.push('RTC 2 adopted decision must not be claimed as runtime-conformant');
  }
  if (files['docs/START-HERE.md'].includes('tools/*` HTTPS API')) {
    errors.push('START-HERE: deleted api/tools/* filesystem route is still advertised');
  }
  if (!files['docs/STATUS.md'].startsWith('## Verified source and deployment checkpoint — 2026-11-01')) {
    errors.push('STATUS: current release/accounting checkpoint missing at top');
  }
  return errors;
}

export const activeDocs = [
  'README.md','docs/ARCHITECTURE.md','docs/COMPLETION-GATES.md',
  'docs/DIRECT-MCP-CONNECTION.md','docs/HUB-COMPATIBILITY.md',
  'docs/MASTER-ROADMAP.md','docs/PLAN.md','docs/START-HERE.md',
  'docs/STATUS.md','docs/pr-cards/work-index.json'
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = Object.fromEntries(activeDocs.map(p => [p, load(p)]));
  const errors = checkDocCodeTruth({files, exists:p=>existsSync(resolve(root,p))});
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Current documentation/source contract OK (' + activeDocs.length + ' indexed files)');
}
