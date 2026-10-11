// All production classification comes from server-fetched Neon state, never tool arguments.
// Inject getBranch/getProfile from trusted server services, not client-submitted metadata.
export async function classifyTarget(ctx, target) {
  if (!ctx || !target || typeof target !== 'object') return {
    allowed: false, production: true, reason: 'unverified_target'
  };
  const projectId = target.projectId;
  if (typeof projectId !== 'string' || !projectId) return {
    allowed: false, production: true, reason: 'missing_project'
  };
  if (target.projectWide === true) return {
    allowed: true, production: true, kind: 'project_wide'
  };
  const branchId = target.branchId;
  if (typeof branchId !== 'string' || !branchId ||
      typeof ctx.getBranch !== 'function') return {
    allowed: false, production: true, reason: 'unverified_branch'
  };
  let branch, profile;
  try {
    branch = await ctx.getBranch({ projectId, branchId });
    if (!branch || branch.id !== branchId) return {
      allowed: false, production: true, reason: 'branch_identity_mismatch'
    };
    if (typeof ctx.getProfile === 'function') profile = await ctx.getProfile(projectId);
  } catch {
    return { allowed: false, production: true, reason: 'branch_lookup_failed' };
  }
  // Neon fields are "default" and "protected"; deprecated "primary" is ignored.
  const primary = branch.default === true || branch.protected === true;
  const profiledProduction = Array.isArray(profile?.productionBranches) &&
    profile.productionBranches.includes(branchId);
  const shared = Array.isArray(profile?.sharedPreviewBranches) &&
    profile.sharedPreviewBranches.includes(branchId);
  return Object.freeze({ allowed: true,
    production: primary || profiledProduction || shared, sharedPreview: shared,
    kind: primary ? 'neon_production' : shared ? 'shared_preview' :
      profiledProduction ? 'profile_production' : 'development'
  });
}

/** Inject as B-1 `checkProduction` after trusted account/branch lookups are available. */
export async function checkProductionAccess(target, ctx, tool) {
  const cls = await classifyTarget(ctx, {
    projectId: target.projectId, branchId: target.branchId,
    projectWide: tool?.projectWide === true
  });
  if (!cls.allowed) return { ...cls, allowed: false };
  if (!cls.production || tool?.productionEffect === 'none')
    return { allowed: true, production: false };
  const conn = ctx?.connection;
  const org = conn?.neonOrg ?? conn?.neon_org;
  if (!org || conn.mode !== 'production' || ctx?.deploymentEnv !== 'production' ||
      typeof ctx?.db?.getNeonOrg !== 'function')
    return { allowed: false, production: true, reason: 'preview_mode' };
  try {
    const settings = await ctx.db.getNeonOrg(org);
    return settings?.production_enabled === true
      ? { allowed: true, production: true, sharedPreview: cls.sharedPreview }
      : { allowed: false, production: true, reason: 'owner_approval_required' };
  } catch {
    return { allowed: false, production: true, reason: 'permission_unavailable' };
  }
}
