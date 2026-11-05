#!/usr/bin/env node
// Development Rack store initialization (companion to rack-server.mjs,
// RACK-2): runs the server's own additive schema creation against
// DATABASE_URL and exits. The rack controller invokes this as the
// instance migration command with the migration role's DATABASE_URL,
// before ownership passes to the runtime role. On Vercel the same
// initSchema() runs lazily inside the function handlers, so this file
// is never part of the deployed service.
import { initSchema } from './src/db.js';

try {
  await initSchema();
  console.log('Neon Unleashed own-store schema is present (additive init complete).');
} catch (error) {
  console.error(`Own-store schema init failed: ${error?.message || 'unknown error'}`);
  process.exit(1);
}
