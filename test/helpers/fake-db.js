// Copied from Robinson-AI-Systems/stripe-mcp test/helpers/fake-db.js @ f9a54f8 (A-1 version; no service tables).
// A-1's service-independent fake database; A-2 extends it with this server's schema (BATCH-A §2).
export function createFakeDb() {
  const rows = new Map();
  return {
    async initSchema() {},
    async put(key, value) { rows.set(key, structuredClone(value)); },
    async get(key) { return rows.has(key) ? structuredClone(rows.get(key)) : null; }
  };
}
