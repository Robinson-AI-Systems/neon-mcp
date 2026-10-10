// DRIFT-PROTOCOL checklist B, minimum enforced in CI: a change to code must carry its docs.
// Adapted from Robinson-AI-Systems/stripe-mcp scripts/check-docs-updated.mjs @ f9a54f8 (adds scripts/, local fallback).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export function requiredDocs(changed, prBody = '') {
  const has = (p) => changed.includes(p);
  const code = changed.some((p) => /^(api|src|scripts)\//.test(p));
  const tools = changed.some((p) => p.startsWith('src/tools/'));
  if (!code || /Docs-update: not needed — .{8,}/.test(prBody)) return [];
  const missing = [];
  if (!has('docs/STATUS.md')) missing.push('docs/STATUS.md');
  if (!changed.some((p) => /^docs\/pr-cards\/(?!README\.md$|validate-index\.py$)/.test(p))) missing.push('a PR card or docs/pr-cards/work-index.json');
  if (tools && !has('docs/TOOL-CATALOG.md')) missing.push('docs/TOOL-CATALOG.md');
  return missing;
}

function resolveBase() {
  const base = process.env.BASE_SHA;
  if (base) {
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Invalid BASE_SHA');
    return { base, how: 'pull request base' };
  }
  try {
    return { base: git('merge-base', 'origin/main', 'HEAD'), how: 'merge-base with origin/main' };
  } catch {
    return null;
  }
}

function main() {
  const resolved = resolveBase();
  if (!resolved) {
    console.log('Docs check: no PR base and no origin/main ref — nothing to compare (run `git fetch origin main:refs/remotes/origin/main`).');
    return;
  }
  const changed = git('diff', '--name-only', resolved.base, 'HEAD', '--').split('\n').filter(Boolean);
  const event = process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)
    ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : null;
  const missing = requiredDocs(changed, event?.pull_request?.body || '');
  if (missing.length) {
    console.error(`Docs check failed (${resolved.how}): code changed but not ${missing.join(', ')}. ` +
      'Update them as if merged, or write "Docs-update: not needed — <reason>" in the PR description.');
    process.exitCode = 1;
  } else console.log(`Docs check passed (${changed.length} changed files vs ${resolved.how})`);
}
if (process.argv[1]?.endsWith('check-docs-updated.mjs')) main();
