// Owner-configured identity of this MCP's OWN Neon project. Never inferred from a branch name.
// Both direct and -pooler Neon hosts refer to the same endpoint and must protect the same project.
// Configuration diagnostics are stable codes only; credentials/hosts never leave the server.
const safeId = value => typeof value === 'string' &&
  /^[a-zA-Z0-9_-]{2,120}$/.test(value);

export class SelfResourceConfigurationError extends Error {
  constructor(code) {
    super('Server self-resource verification unavailable');
    this.name = 'SelfResourceConfigurationError';
    this.code = code;
  }
}

// Canonicalize only Neon's exact first-label -pooler alias, never a substring,
// suffix from another DNS name, wildcard, port, or parent domain.
export function canonicalNeonEndpointHost(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 253 ||
      !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(value))
    throw new Error('Invalid Neon endpoint hostname');
  const labels = value.toLowerCase().split('.');
  if (labels.some(label => label.startsWith('-') || label.endsWith('-')))
    throw new Error('Invalid Neon endpoint hostname');
  labels[0] = labels[0].replace(/-pooler$/, '');
  if (!labels[0] || labels[0].endsWith('-'))
    throw new Error('Invalid Neon endpoint hostname');
  return labels.join('.');
}

export function configuredSelfResource(env = process.env) {
  const org = env?.NEON_MCP_SELF_ORG_ID;
  const project_id = env?.NEON_MCP_SELF_PROJECT_ID;
  const expectedHost = env?.NEON_MCP_SELF_ENDPOINT_HOST;
  if (!safeId(org) || !safeId(project_id) || typeof expectedHost !== 'string' ||
      !expectedHost || !env?.DATABASE_URL)
    throw new SelfResourceConfigurationError('self_identity_missing');
  let actualHost, recordedHost;
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgresql:', 'postgres:'].includes(url.protocol))
      throw new Error('Invalid PostgreSQL protocol');
    actualHost = canonicalNeonEndpointHost(url.hostname);
  } catch {
    throw new SelfResourceConfigurationError('self_database_uri_invalid');
  }
  try {
    recordedHost = canonicalNeonEndpointHost(expectedHost);
  } catch {
    throw new SelfResourceConfigurationError('self_endpoint_invalid');
  }
  if (actualHost !== recordedHost)
    throw new SelfResourceConfigurationError('self_endpoint_mismatch');
  return Object.freeze({ org, project_id });
}
