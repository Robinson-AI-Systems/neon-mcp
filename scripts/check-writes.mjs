// Write-safety check, starting form (A-1). B-7 adds the full declaration rules (productionEffect, spend, access, …).
// Checks what exists today: every registered tool is named neon_*, declares `writes`, and every write tool exposes
// dryRun and confirm and declares its write contract.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export function checkWrites(tools) {
  const failures = [];
  for (const tool of tools) {
    if (!/^neon_[a-z0-9_]+$/.test(tool.name)) failures.push(`${tool.name}: tool names start with neon_ (DECISIONS 2026-10-10)`);
    if (typeof tool.writes !== 'boolean') failures.push(`${tool.name}: must declare writes: true | false`);
    if (!tool.writes) continue;
    const p = tool.inputSchema?.properties;
    if (!p?.dryRun || !p?.confirm) failures.push(`${tool.name}: write tool missing dryRun/confirm inputs`);
    if (!tool.writeContract) failures.push(`${tool.name}: write tool missing declared write contract (defineWrite)`);
  }
  return failures;
}

async function main() {
  const { registry } = await import(pathToFileURL(path.resolve('src/tools/index.js')).href);
  if (!registry.tools.length) {
    console.log('Write safety: 0 tools registered — nothing to check');
    return;
  }
  const failures = checkWrites(registry.tools);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log(`Write safety: ${registry.tools.length} tools checked`);
}
if (process.argv[1]?.endsWith('check-writes.mjs')) await main();
