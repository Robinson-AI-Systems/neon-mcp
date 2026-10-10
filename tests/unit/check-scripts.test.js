import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCoreImports } from '../../scripts/check-core-imports.mjs';
import { requiredDocs } from '../../scripts/check-docs-updated.mjs';
import { checkWrites } from '../../scripts/check-writes.mjs';
import { checkBudgets } from '../../scripts/check-budgets.mjs';

function withCore(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'neon-mcp-core-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('check-core-imports', () => {
  it('fails a src/core file importing @neon/sdk', () => withCore({ 'src/core/x.js': "import { raw } from '@neon/sdk';\n" }, (dir) => {
    expect(checkCoreImports(dir).failures).toEqual(['src/core/x.js: imports Neon package @neon/sdk']);
  }));
  it('fails imports of src/neon, src/tools and the serverless driver, including dynamic and re-exports', () => withCore({
    'src/core/a.js': "import { call } from '../neon/client.js';\nexport { registry } from '../tools/index.js';\n",
    'src/core/sub/b.js': "const m = await import('@neondatabase/serverless');\n"
  }, (dir) => {
    expect(checkCoreImports(dir).failures.sort()).toEqual([
      'src/core/a.js: imports ../neon/client.js (outside src/core/)',
      'src/core/a.js: imports ../tools/index.js (outside src/core/)',
      'src/core/sub/b.js: imports Neon package @neondatabase/serverless'
    ]);
  }));
  it('passes generic code and reports a missing src/core', () => {
    withCore({ 'src/core/ok.js': "import crypto from 'node:crypto';\nimport { x } from './sub/y.js';\n" }, (dir) => {
      expect(checkCoreImports(dir)).toEqual({ files: 1, failures: [], missing: false });
    });
    withCore({ 'README.md': 'x' }, (dir) => expect(checkCoreImports(dir).missing).toBe(true));
  });
  it('passes on this repository', () => expect(checkCoreImports('.').failures).toEqual([]));
});

describe('check-docs-updated (DRIFT-PROTOCOL B minimum)', () => {
  it('requires STATUS and a card when code or scripts change', () => {
    expect(requiredDocs(['scripts/x.mjs'])).toEqual(['docs/STATUS.md', 'a PR card or docs/pr-cards/work-index.json']);
    expect(requiredDocs(['src/neon/client.js', 'docs/STATUS.md', 'docs/pr-cards/A-4.md'])).toEqual([]);
  });
  it('requires TOOL-CATALOG when src/tools changes', () => {
    expect(requiredDocs(['src/tools/x.js', 'docs/STATUS.md', 'docs/pr-cards/work-index.json'])).toEqual(['docs/TOOL-CATALOG.md']);
  });
  it('does not count the README or validator as a card, and ignores docs-only PRs', () => {
    expect(requiredDocs(['api/mcp.js', 'docs/STATUS.md', 'docs/pr-cards/README.md'])).toEqual(['a PR card or docs/pr-cards/work-index.json']);
    expect(requiredDocs(['docs/PLAN.md'])).toEqual([]);
  });
  it('accepts an explicit exception with a reason', () => {
    expect(requiredDocs(['scripts/x.mjs'], 'Docs-update: not needed — formatting only change')).toEqual([]);
    expect(requiredDocs(['scripts/x.mjs'], 'Docs-update: not needed — x')).not.toEqual([]);
  });
});

describe('check-writes and check-budgets (starting form)', () => {
  const read = { name: 'neon_list_projects', writes: false, description: 'List projects.' };
  it('pass on well-formed tools', () => {
    const write = { name: 'neon_create_branch', writes: true, description: 'Create a branch.', writeContract: {},
      inputSchema: { properties: { dryRun: {}, confirm: {} } } };
    expect(checkWrites([read, write])).toEqual([]);
    expect(checkBudgets([read, write])).toEqual([]);
  });
  it('fail a write tool without dryRun/confirm or contract, an unprefixed name and a missing writes flag', () => {
    expect(checkWrites([{ name: 'neon_delete_branch', writes: true }])).toEqual([
      'neon_delete_branch: write tool missing dryRun/confirm inputs',
      'neon_delete_branch: write tool missing declared write contract (defineWrite)'
    ]);
    expect(checkWrites([{ name: 'list_projects', writes: false }])[0]).toMatch(/start with neon_/);
    expect(checkWrites([{ name: 'neon_x' }])[0]).toMatch(/declare writes/);
  });
  it('fail a long or missing description and an oversized catalog', () => {
    expect(checkBudgets([{ ...read, description: 'x'.repeat(161) }])[0]).toMatch(/161 > 160/);
    expect(checkBudgets([{ ...read, description: '' }])[0]).toMatch(/missing description/);
    const many = Array.from({ length: 600 }, (_, i) => ({ name: `neon_t${i}`, description: 'd'.repeat(150) }));
    expect(checkBudgets(many).at(-1)).toMatch(/catalog ~\d+ tokens > 20000/);
  });
});
