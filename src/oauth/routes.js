// Copied and adapted from Robinson-AI-Systems/stripe-mcp src/oauth/routes.js @ e2f90e8
// Neon MCP composition boundary: reusable core handlers are dependency injected.
import { createDb } from '../db.js';
import { createOAuthHandlers } from '../core/oauth-handlers.js';

export async function handleOAuth(which, req, res) {
  try {
    const db = createDb();
    await db.initSchema();
    return await createOAuthHandlers({ db })[which](req, res);
  } catch {
    // Never send SQL statements, tokens, passphrase or other internal error details.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'temporarily_unavailable',
      error_description: 'Neon MCP is not configured or its database is unavailable' });
  }
}
