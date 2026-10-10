// Planted values are assembled at run time so this file itself never contains a key-shaped string.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanFiles, scanText, vendoredSpecIsPinned } from '../../scripts/check-secrets.mjs';

const labels = (text) => scanText(text).map((f) => f.label);
const A = (n) => 'a7Q9'.repeat(Math.ceil(n / 4)).slice(0, n);

describe('secret scan: planted secrets fail', () => {
  it('a Neon API key', () => expect(labels('key ' + 'napi' + '_' + A(64))).toEqual(['Neon API key']));
  it('a Neon role password', () => expect(labels('pw ' + 'npg' + '_' + A(12))).toEqual(['Neon role password']));
  it('a connection string with a password to a Neon host', () => {
    const url = 'postgresql' + '://u:p' + '@' + 'ep-cool-dark' + 'ness-a1b2c3d4.us-east-2.aws.neon.tech/db';
    expect(labels(url)).toEqual(expect.arrayContaining(['database URL with password', 'Neon endpoint host']));
  });
  it('a real-looking endpoint host, endpoint ID, branch ID and organization ID', () => {
    expect(labels('ep-' + 'quiet-river-' + 'a1b2c3d4-pooler.c-2.us-east-2.aws.neon.tech')).toContain('Neon endpoint host');
    expect(labels('ep-' + 'quiet-river-' + 'a1b2c3d4')).toEqual(['Neon endpoint ID']);
    expect(labels('br-' + 'aged-salad-' + '637688')).toEqual(['Neon branch ID']);
    expect(labels('org-' + 'tiny-cloud-' + '12345678')).toEqual(['Neon organization ID']);
  });
  it('GitHub and Vercel credentials', () => {
    expect(labels('ghp' + '_' + A(36))).toEqual(['GitHub token']);
    expect(labels('github' + '_pat_' + A(40))).toEqual(['GitHub token']);
    expect(labels('prj' + '_' + A(28))).toEqual(['Vercel ID']);
    expect(labels('VERCEL_TOKEN' + '=' + A(24))).toEqual(['secret assignment']);
  });
  it('reports file, line and only the first 6 characters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'neon-mcp-secret-'));
    try {
      writeFileSync(join(dir, 'planted.txt'), 'line one\nkey = ' + 'napi' + '_' + A(40) + '\n');
      const [hit] = scanFiles(['planted.txt'], { root: dir });
      expect(hit).toEqual({ path: 'planted.txt', label: 'Neon API key', line: 2, start: 'napi_a' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('secret scan: fakes and local values pass', () => {
  it('napi_FAKE…, npg_FAKE…, local connection strings and fake IDs', () => {
    expect(scanText('napi_FAKE' + A(40) + ' npg_FAKE' + A(12))).toEqual([]);
    expect(scanText('postgresql://user:FAKE@localhost/db postgresql://postgres:ci-only@127.0.0.1:5432/postgres')).toEqual([]);
    expect(scanText('br-fake-branch-000001 ep-fake-endpoint-000001.us-east-2.aws.neon.tech org-fake-000001')).toEqual([]);
    expect(scanText('format: postgresql://user:password@host/db (placeholder host)')).toEqual([]);
    expect(scanText('DATABASE_URL=${{ secrets.X }} DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres')).toEqual([]);
  });
});

describe('secret scan: the vendored Neon description', () => {
  it('is skipped only while it matches its pinned SHA-256', () => {
    expect(vendoredSpecIsPinned('.')).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'neon-mcp-spec-'));
    try {
      mkdirSync(join(dir, 'vendor/neon-openapi'), { recursive: true });
      copyFileSync('vendor/neon-openapi/SOURCE.md', join(dir, 'vendor/neon-openapi/SOURCE.md'));
      writeFileSync(join(dir, 'vendor/neon-openapi/v2.yaml'), 'edited: ' + 'napi' + '_' + A(40) + '\n');
      expect(vendoredSpecIsPinned(dir)).toBe(false);
      expect(scanFiles(['vendor/neon-openapi/v2.yaml'], { root: dir }).map((f) => f.label)).toEqual(['Neon API key']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('the command fails (exit 1) on a planted file and passes on the repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'neon-mcp-cli-'));
    try {
      const planted = join(dir, 'planted.env');
      writeFileSync(planted, 'NEON_KEY=' + 'napi' + '_' + A(48) + '\n');
      let status = 0;
      let stderr = '';
      try { execFileSync(process.execPath, ['scripts/check-secrets.mjs', '--file', planted], { stdio: 'pipe' }); }
      catch (e) { status = e.status; stderr = String(e.stderr); }
      expect(status).toBe(1);
      expect(stderr).toMatch(/Neon API key/);
      expect(stderr).not.toContain(A(48));
      expect(execFileSync(process.execPath, ['scripts/check-secrets.mjs'], { encoding: 'utf8' })).toMatch(/Secret scan passed/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
