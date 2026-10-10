import { mergeNamespaces } from '../core/registry.js';
// A-1 intentionally registers no Neon tools. A-5 adds the first (neon_whoami, neon_list_accounts).
export const registry = mergeNamespaces([]);
