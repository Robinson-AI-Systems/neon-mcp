// Secret and infrastructure-ID scan over every tracked (and untracked, not ignored) file.
// Pattern shape copied from Robinson-AI-Systems/stripe-mcp scripts/check-secrets.mjs @ f9a54f8; Neon rules per card A-1.
// Prints only a label, the file, the line and the first 6 characters of a match — never the whole value.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SPEC = 'vendor/neon-openapi/v2.yaml';
const SPEC_SOURCE = 'vendor/neon-openapi/SOURCE.md';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'example.com', 'example.test']);
const hasFake = (s) => /fake/i.test(s);
const digit = '(?=[a-z0-9]*[0-9])[a-z0-9]{6,}';

// [label, pattern, allowed(match) → true when the match is an accepted fake]
const RULES = [
  ['Neon API key', /\bnapi_[A-Za-z0-9]{20,}/g, (m) => /^napi_FAKE/.test(m[0])],
  ['Neon role password', /\bnpg_[A-Za-z0-9]{8,}/g, (m) => /^npg_FAKE/.test(m[0])],
  ['database URL with password', /postgres(?:ql)?:\/\/[^\s/@:'"`]+:[^\s/@'"`]+@(\[[^\]]+\]|[A-Za-z0-9][A-Za-z0-9.-]*)/gi,
    // A host without a dot (`host`, `db`, a truncated `ep-…`) is a placeholder in prose, not a reachable server.
    (m) => LOCAL_HOSTS.has(m[1].toLowerCase()) || !m[1].includes('.')],
  ['Neon endpoint host', /\bep-[a-z0-9-]+\.[a-z0-9.-]*neon\.(?:tech|build|com)\b/gi, (m) => hasFake(m[0])],
  ['Neon endpoint ID', new RegExp(`\\bep-[a-z]+-[a-z]+-${digit}\\b`, 'g'), (m) => hasFake(m[0])],
  ['Neon branch ID', new RegExp(`\\bbr-[a-z]+-[a-z]+-${digit}\\b`, 'g'), (m) => hasFake(m[0])],
  ['Neon organization ID', new RegExp(`\\borg-[a-z]+-[a-z]+-${digit}\\b`, 'g'), (m) => hasFake(m[0])],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g, () => false],
  ['RTC bearer pass', /\brtc_pass_[A-Za-z0-9_-]{43}\b/g, () => false],
  ['Vercel ID', /\b(?:prj|team)_[A-Za-z0-9]{20,}\b/g, (m) => hasFake(m[0])],
  ['secret assignment', /\b(VERCEL_TOKEN|NEON_API_KEY|TOKEN_ENCRYPTION_KEY|ADMIN_PASSPHRASE|DATABASE_URL)\s*[=:]\s*['"]?([^\s'"`]{16,})/g,
    (m) => hasFake(m[2]) || m[2].startsWith('$') || /^postgres(?:ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(m[2])]
];

export function scanText(text) {
  const found = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const [label, pattern, allowed] of RULES) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        if (allowed(match)) continue;
        found.push({ label, line: index + 1, start: match[0].slice(0, 6) });
      }
    }
  });
  return found;
}

/** The vendored Neon description is skipped only while it is byte-for-byte the file recorded in SOURCE.md. */
export function vendoredSpecIsPinned(root = '.') {
  const spec = path.join(root, SPEC);
  const source = path.join(root, SPEC_SOURCE);
  if (!fs.existsSync(spec) || !fs.existsSync(source)) return false;
  const pinned = fs.readFileSync(source, 'utf8').match(/SHA-256 \| `([a-f0-9]{64})`/)?.[1];
  const actual = crypto.createHash('sha256').update(fs.readFileSync(spec)).digest('hex');
  return Boolean(pinned) && pinned === actual;
}

export function scanFiles(paths, { root = '.' } = {}) {
  const failures = [];
  const skipSpec = vendoredSpecIsPinned(root);
  for (const rel of paths) {
    if (skipSpec && rel === SPEC) continue;
    const full = path.resolve(root, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue;
    for (const hit of scanText(bytes.toString('utf8'))) failures.push({ path: rel, ...hit });
  }
  return failures;
}

export function listRepoFiles(root = '.') {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
}

function main() {
  const fileMode = process.argv[2] === '--file';
  const paths = fileMode ? process.argv.slice(3) : listRepoFiles();
  const failures = scanFiles(paths);
  if (failures.length) {
    for (const f of failures) console.error(`Secret scan: ${f.label} in ${f.path}:${f.line} (starts "${f.start}…")`);
    console.error(`Secret scan FAILED: ${failures.length} finding(s). Use fake values (napi_FAKE…, npg_FAKE…, br-fake-…).`);
    process.exitCode = 1;
  } else {
    console.log(`Secret scan passed (${paths.length} files${!fileMode && vendoredSpecIsPinned() ? '; vendored Neon description matches its pinned SHA-256' : ''})`);
  }
}
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) main();
