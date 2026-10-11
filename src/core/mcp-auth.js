// Copied and adapted from Robinson-AI-Systems/stripe-mcp src/core/mcp-auth.js @ e2f90e8
// Contract-generic MCP bearer authentication. Never forwards the bearer to the provider.
import { publicOrigin, send } from './http.js';

export async function requireMcpToken(req, res, db, env = process.env) {
  const origin = publicOrigin(env);
  const challenge = 'Bearer resource_metadata="' + origin + '/.well-known/oauth-protected-resource"';
  const match = /^Bearer ([A-Za-z0-9_-]{30,256})$/.exec(String(req.headers?.authorization || ''));
  if (!match) {
    res.setHeader('WWW-Authenticate', challenge);
    send(res, 401, { error: 'unauthorized', error_description: 'A valid connection is required' });
    return null;
  }
  const record = await db.getAccessToken(match[1]);
  if (!record || !['read_only','everyday','full'].includes(record.profile) ||
      !['catalog','compact'].includes(record.listing) || !['preview','production'].includes(record.mode)) {
    res.setHeader('WWW-Authenticate', challenge + ', error="invalid_token"');
    send(res, 401, { error: 'invalid_token' });
    return null;
  }
  // A preview deployment shares storage but must not inherit production permissions.
  if (record.mode === 'production' && env.VERCEL_ENV === 'production') {
    const orgs = await db.listNeonOrgs();
    if (!orgs.some(org => org.id === record.neon_org && org.production_enabled === true)) {
      res.setHeader('WWW-Authenticate', challenge + ', error="invalid_token"');
      send(res, 401, { error: 'invalid_token' });
      return null;
    }
  }
  return Object.freeze({ clientId: record.client_id, neonOrg: record.neon_org,
    projectScope: record.project_scope,
    mode: env.VERCEL_ENV === 'production' ? record.mode : 'preview',
    profile: record.profile, listing: record.listing });
}
