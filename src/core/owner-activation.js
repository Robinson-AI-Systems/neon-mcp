// Neither software deployment nor an agent can approve real production use.
// IN-08 keeps this gate OFF until BOTH owner-approved X-2 and X-3 tests pass.
import { configuredSelfResource } from './self-resource.js';
import { validateProtectedResources } from './protected-resources.js';

export async function activationEligible({ env = process.env, db, orgId } = {}) {
  if (env.VERCEL_ENV !== 'production' ||
      env.NEON_MCP_LIVE_GATES_APPROVED !== 'approved-after-X2-X3' ||
      env.NEON_MCP_PROTECTED_LIST_CONFIRMED !== 'owner-confirmed' ||
      !orgId || !db?.getProtectedResources) return false;
  try {
    const own = configuredSelfResource(env);
    if (own.org !== orgId) return false;
    const rows = validateProtectedResources(await db.getProtectedResources());
    // An unconfigured other-server exclusion list does not meet IN-07.
    return rows.some(entry => entry.kind === 'robinson');
  } catch { return false; }
}
