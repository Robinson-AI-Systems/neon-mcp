// Copied and adapted from Robinson-AI-Systems/stripe-mcp src/core/mcp-auth.js @ e2f90e8
// Contract-generic MCP bearer authentication. Never forwards the bearer to the provider.
import { publicOrigin, send } from './http.js';

export async function requireMcpToken(req, res, db, env = process.env) {
  let origin;
  try { origin = publicOrigin(env); }
  catch { send(res, 503, { error: 'service_unavailable' }); return null; }
  const challenge = 'Bearer resource_metadata="' + origin + '/.well-known/oauth-protected-resource"';
  const match = /^Bearer[ \t]+([A-Za-z0-9_-]{30,256})$/i.exec(String(req.headers?.authorization || ''));
  if (!match) {
    res.setHeader('WWW-Authenticate', challenge);
    send(res, 401, { error: 'unauthorized', error_description: 'A valid connection is required' });
    return null;
  }
  let record;
  try { record = await db.getAccessToken(match[1]); }
  catch { send(res, 503, { error: 'service_unavailable' }); return null; }
  if (!record || !['read_only','everyday','full'].includes(record.profile) ||
      !['catalog','compact'].includes(record.listing) || !['preview','production'].includes(record.mode) ||
      (record.mode === 'production' && env.VERCEL_ENV !== 'production')) {
    res.setHeader('WWW-Authenticate', challenge + ', error="invalid_token"');
    send(res, 401, { error: 'invalid_token' });
    return null;
  }
  // Never reinterpret an existing production grant as a preview grant. Deployments
  // share storage; even a read could expose production data on the wrong host.
  if (record.mode === 'production' && env.VERCEL_ENV === 'production') {
    let orgs;
    try { orgs = await db.listNeonOrgs(); }
    catch { send(res, 503, { error: 'service_unavailable' }); return null; }
    if (!orgs.some(org => org.id === record.neon_org && org.production_enabled === true)) {
      res.setHeader('WWW-Authenticate', challenge + ', error="invalid_token"');
      send(res, 401, { error: 'invalid_token' });
      return null;
    }
  }
  return Object.freeze({ clientId: record.client_id, neonOrg: record.neon_org,
    projectScope: record.project_scope,
    mode: record.mode,
    profile: record.profile, listing: record.listing });
}
