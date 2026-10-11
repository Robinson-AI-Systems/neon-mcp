// Copied from Robinson-AI-Systems/stripe-mcp test/helpers/fake-db.js @ f9a54f8 (A-1 version).
// In-memory service database; mirrors schema existence without pretending to enforce PostgreSQL constraints.
import { SCHEMA_TABLES } from '../../src/db.js';

export function createFakeDb() {
  const rows = new Map();
  const tables = new Set();
  return {
    async initSchema() { SCHEMA_TABLES.forEach((name) => tables.add(name)); },
    async listTables() { return [...tables]; },
    async put(key, value) { rows.set(key, structuredClone(value)); },
    async get(key) { return rows.has(key) ? structuredClone(rows.get(key)) : null; }
  };
}
