// Token-budget check, starting form (A-1). C-2 adds per-listing-mode budgets and default result sizes.
// Checks what exists today: listing descriptions ≤160 characters and the whole catalog under its token budget.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const DESCRIPTION_MAX = 160;
export const CATALOG_TOKEN_BUDGET = 20000;
export const estimateTokens = (value) => Math.ceil(JSON.stringify(value).length / 4);

export function checkBudgets(tools) {
  const failures = [];
  for (const t of tools) {
    const length = (t.description || '').length;
    if (!length) failures.push(`${t.name}: missing description`);
    if (length > DESCRIPTION_MAX) failures.push(`${t.name}: description ${length} > ${DESCRIPTION_MAX} characters`);
  }
  const tokens = estimateTokens(tools);
  if (tokens > CATALOG_TOKEN_BUDGET) failures.push(`catalog ~${tokens} tokens > ${CATALOG_TOKEN_BUDGET}`);
  return failures;
}

async function main() {
  const { registry } = await import(pathToFileURL(path.resolve('src/tools/index.js')).href);
  const tools = registry.tools;
  if (!tools.length) {
    console.log('Token budgets: 0 tools registered — nothing to check');
    return;
  }
  const failures = checkBudgets(tools);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log(`Token budgets pass for ${tools.length} tools`);
  if (process.argv.includes('--print')) console.log(`Catalog estimated tokens: ${estimateTokens(tools)}`);
}
if (process.argv[1]?.endsWith('check-budgets.mjs')) await main();
