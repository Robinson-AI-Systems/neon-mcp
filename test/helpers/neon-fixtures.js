// Built for neon-mcp (A-1). Made-up Neon records — never real organization, project, branch or endpoint IDs or hosts
// (AGENTS hard limits). Every fixture validates against the vendored Neon API description
// (tests/unit/fixtures-valid.test.js). Each export is a function so every test gets a fresh copy.
//
// The shape: one project with a default, protected branch `main` and a child branch `dev`, a read-write compute on
// each, database `neondb` owned by role `neondb_owner` on each branch.

export const AT = '2026-10-10T12:00:00Z';
export const IDS = Object.freeze({
  org: 'org-fake-000001',
  project: 'proj-fake-000001',
  main: 'br-fake-branch-000001',
  dev: 'br-fake-branch-000002',
  mainEndpoint: 'ep-fake-endpoint-000001',
  devEndpoint: 'ep-fake-endpoint-000002'
});
const REGION = 'aws-us-east-2';
const host = (endpointId) => `${endpointId}.us-east-2.aws.neon.tech`;

export function project(overrides = {}) {
  return {
    id: IDS.project, platform_id: 'aws', region_id: REGION, name: 'fake-project', pg_version: 17,
    proxy_host: 'us-east-2.aws.neon.tech', branch_logical_size_limit: 0, branch_logical_size_limit_bytes: 0,
    store_passwords: true, cpu_used_sec: 0, provisioner: 'k8s-neonvm', creation_source: 'console',
    history_retention_seconds: 86400, created_at: AT, updated_at: AT, owner_id: 'fake-owner-000001',
    org_id: IDS.org, consumption_period_start: AT, consumption_period_end: '2026-11-01T00:00:00Z',
    active_time_seconds: 0, compute_time_seconds: 0, written_data_bytes: 0, data_transfer_bytes: 0,
    data_storage_bytes_hour: 0, ...overrides
  };
}

function branch({ id, name, parentId, isDefault, isProtected }, overrides) {
  return {
    id, project_id: IDS.project, name, current_state: 'ready', state_changed_at: AT, creation_source: 'console',
    created_at: AT, updated_at: AT, default: isDefault, protected: isProtected, cpu_used_sec: 0,
    active_time_seconds: 0, compute_time_seconds: 0, written_data_bytes: 0, data_transfer_bytes: 0,
    ...(parentId ? { parent_id: parentId } : {}), ...overrides
  };
}
export const mainBranch = (o = {}) => branch({ id: IDS.main, name: 'main', isDefault: true, isProtected: true }, o);
export const devBranch = (o = {}) => branch({ id: IDS.dev, name: 'dev', parentId: IDS.main, isDefault: false, isProtected: false }, o);

function endpoint({ id, branchId }, overrides) {
  return {
    host: host(id), id, project_id: IDS.project, branch_id: branchId, region_id: REGION,
    autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 1, type: 'read_write', current_state: 'idle',
    pooler_enabled: false, pooler_mode: 'transaction', disabled: false, passwordless_access: true,
    creation_source: 'console', created_at: AT, updated_at: AT, settings: {}, proxy_host: 'us-east-2.aws.neon.tech',
    suspend_timeout_seconds: 300, provisioner: 'k8s-neonvm', ...overrides
  };
}
export const mainEndpoint = (o = {}) => endpoint({ id: IDS.mainEndpoint, branchId: IDS.main }, o);
export const devEndpoint = (o = {}) => endpoint({ id: IDS.devEndpoint, branchId: IDS.dev }, o);

export const database = (branchId = IDS.main, o = {}) => ({
  id: branchId === IDS.main ? 1 : 2, branch_id: branchId, name: 'neondb', owner_name: 'neondb_owner',
  created_at: AT, updated_at: AT, ...o
});
export const role = (branchId = IDS.main, o = {}) => ({
  branch_id: branchId, name: 'neondb_owner', protected: false, created_at: AT, updated_at: AT, ...o
});

let opSeq = 0;
/** A Neon operation; `status` defaults to running (fake-neon's waiter moves it to finished). */
export function operation({ action = 'create_branch', status = 'running', branchId = IDS.dev, endpointId, id } = {}) {
  opSeq += 1;
  return {
    id: id || `fake-op-${String(opSeq).padStart(6, '0')}`, project_id: IDS.project, branch_id: branchId,
    ...(endpointId ? { endpoint_id: endpointId } : {}), action, status, failures_count: 0,
    created_at: AT, updated_at: AT, total_duration_ms: 0
  };
}

/** Whole response bodies, keyed by operationId, for the common reads and one create. */
export const responses = {
  getProject: () => ({ project: project() }),
  listProjectBranches: () => ({ branches: [mainBranch(), devBranch()], annotations: {} }),
  getProjectBranch: (which = 'main') => {
    const b = which === 'dev' ? devBranch() : mainBranch();
    return { branch: b, annotation: { object: { type: 'console/branch', id: b.id }, value: {} } };
  },
  listProjectEndpoints: () => ({ endpoints: [mainEndpoint(), devEndpoint()] }),
  listProjectBranchDatabases: (branchId = IDS.main) => ({ databases: [database(branchId)] }),
  listProjectBranchRoles: (branchId = IDS.main) => ({ roles: [role(branchId)] }),
  createProjectBranch: () => ({
    branch: devBranch({ current_state: 'init' }), endpoints: [devEndpoint({ current_state: 'init' })],
    operations: [operation({ action: 'create_branch' }), operation({ action: 'start_compute', endpointId: IDS.devEndpoint })],
    roles: [role(IDS.dev)], databases: [database(IDS.dev)]
  })
};
