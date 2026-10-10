import { defineConfig } from 'vitest/config';
// Unit suite: fake Neon, no network, no database.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.js'], environment: 'node', testTimeout: 15000 }
});
