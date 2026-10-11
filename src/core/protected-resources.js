// Protected infrastructure cannot be changed by any write, regardless of confirmation.
const KINDS = new Set(['self', 'robinson', 'other']);
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{2,120}$/.test(v);
const projectKey = row => row.org + '\u0000' + row.project_id;
export function validateProtectedResources(items) {
  if (!Array.isArray(items) || items.length > 200) throw new TypeError('Invalid protected resources list');
  const seen = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || !KINDS.has(item.kind) ||
        !id(item.org) || !id(item.project_id) ||
        (item.branch_id != null && !id(item.branch_id)) ||
        typeof item.label !== 'string' || !item.label.trim() || item.label.length > 100)
      throw new TypeError('Invalid protected resource');
    const entry = { kind: item.kind, org: item.org,
      project_id: item.project_id, ...(item.branch_id ? { branch_id: item.branch_id } : {}),
      label: item.label.trim() };
    const key = projectKey(entry) + '\u0000' + (entry.branch_id || '');
    if (seen.has(key)) throw new TypeError('Duplicate protected resource');
    seen.add(key);
    return Object.freeze(entry);
  });
}

/** Owner may add/remove other resources, but can never remove or replace the self project. */
export function mergeWithSelf(resources, self) {
  if (!self || !id(self.org) || !id(self.project_id))
    throw new Error('Self project must be independently verified before writes can be enabled');
  const required = { kind: 'self', org: self.org, project_id: self.project_id, label: 'Neon MCP own database' };
  const userEntries = validateProtectedResources(resources).filter(item =>
    !(item.org === required.org && item.project_id === required.project_id));
  return Object.freeze([Object.freeze(required), ...userEntries]);
}

export function protectsTarget(resources, target) {
  if (!target || !id(target.org) || !id(target.projectId)) return true;
  return resources.some(resource => resource.org === target.org &&
    resource.project_id === target.projectId &&
    (!resource.branch_id || !target.branchId || resource.branch_id === target.branchId));
}

/** Missing self identity, DB, or storage fails closed. No owner selection of IN-07 assumed. */
export async function checkProtectedTarget(target, ctx) {
  if (!ctx?.db || typeof ctx.db.getProtectedResources !== 'function' ||
      !ctx.selfProject || typeof ctx.selfProject !== 'object')
    return false;
  try {
    const list = await ctx.db.getProtectedResources();
    const protectedItems = mergeWithSelf(list, ctx.selfProject);
    return !protectsTarget(protectedItems, {
      org: ctx.connection?.neonOrg ?? ctx.connection?.neon_org,
      projectId: target.projectId, branchId: target.branchId
    });
  } catch {
    return false;
  }
}
