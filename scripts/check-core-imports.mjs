// src/core/ must stay contract-generic (BATCH-A decision A2): it imports nothing Neon-specific, so the hub can extract
// it into robinson-mcp-core. Fails on any import from src/neon/, src/tools/ or anywhere outside src/core/, and on any
// Neon package.
import fs from 'node:fs';
import path from 'node:path';

const NEON_PACKAGE = /^@neon(?:database)?\/|^neon[-/]|^libpg-query$/;
const SPECIFIER = /(?:\bimport\s+(?:[^'"]*?\sfrom\s*)?|\bexport\s+[^'"]*?\sfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:m?js|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function checkCoreImports(root = '.') {
  const core = path.resolve(root, 'src/core');
  if (!fs.existsSync(core)) return { files: 0, failures: [], missing: true };
  const failures = [];
  const files = walk(core);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(SPECIFIER)) {
      const spec = match[1];
      const rel = path.relative(root, file);
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        if (target !== core && !target.startsWith(core + path.sep)) failures.push(`${rel}: imports ${spec} (outside src/core/)`);
      } else if (NEON_PACKAGE.test(spec)) failures.push(`${rel}: imports Neon package ${spec}`);
    }
  }
  return { files: files.length, failures, missing: false };
}

function main() {
  const { files, failures, missing } = checkCoreImports();
  if (missing) console.log('Core imports: src/core/ does not exist yet — nothing to check');
  else if (failures.length) {
    console.error(failures.join('\n'));
    console.error('Core imports FAILED: src/core/ must not depend on Neon code (BATCH-A decision A2).');
    process.exitCode = 1;
  } else console.log(`Core imports: ${files} file(s) in src/core/ import nothing Neon-specific`);
}
if (process.argv[1]?.endsWith('check-core-imports.mjs')) main();
