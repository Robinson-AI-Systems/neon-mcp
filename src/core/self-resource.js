// Owner-configured identity of this MCP's OWN Neon project. Not inferred from a branch name.
// When missing, write guards must refuse writes; passwords/hosts are never returned.
const safeId = value => typeof value === 'string' &&
  /^[a-zA-Z0-9_-]{2,120}$/.test(value);
export function configuredSelfResource(env = process.env) {
  const org = env.NEON_MCP_SELF_ORG_ID;
  const project_id = env.NEON_MCP_SELF_PROJECT_ID;
  const expectedHost = env.NEON_MCP_SELF_ENDPOINT_HOST;
  if (!safeId(org) || !safeId(project_id) || !expectedHost || !env.DATABASE_URL)
    throw new Error('Owner must configure this server’s own Neon project before write tools can run');
  let actualHost;
  try {
    const u = new URL(env.DATABASE_URL);
    if (!['postgresql:', 'postgres:'].includes(u.protocol)) throw Error('bad');
    actualHost = u.hostname.toLowerCase();
  } catch { throw new Error('This server database URL is invalid'); }
  if (actualHost !== expectedHost.toLowerCase() || !actualHost)
    throw new Error('This server database host does not match the owner-confirmed endpoint');
  return Object.freeze({ org, project_id });
}
