import { describe, expect, it } from 'vitest';
import { mergeNamespaces } from '../../src/core/registry.js';
import { registry } from '../../src/tools/index.js';

const make = (name) => ({ tools: [{ name }], handlers: { [name]: async () => null } });
describe('tool registry', () => {
  it('keeps original reads and guarded owner controls plus B-8a scoped reads', () => {
    expect(registry.tools.map(t=>t.name)).toEqual(['neon_whoami','neon_list_accounts',
      'neon_enable_production','neon_disable_production',
      'neon_list_connections','neon_recent_changes','neon_get_settings','neon_where_is_setting','neon_revoke_connection','neon_check_key_access','neon_update_settings','neon_get_result','neon_project_list','neon_project_list_regions','neon_project_overview','neon_operation_list','neon_operation_get','neon_project_get_settings','neon_project_rename','neon_project_delete','neon_project_recover','neon_project_create','neon_project_update_settings','neon_project_set_history_retention','neon_project_set_quotas','neon_branch_list','neon_branch_get','neon_branch_compare_schema','neon_branch_rename','neon_branch_set_protected','neon_branch_set_expiration','neon_branch_set_default','neon_branch_create','neon_branch_delete','neon_branch_recover','neon_branch_reset_from_parent','neon_branch_restore',
      'neon_compute_list','neon_compute_get','neon_compute_estimate_cost',
      'neon_compute_create','neon_compute_resize',
      'neon_compute_start','neon_compute_suspend','neon_compute_restart',
      'neon_compute_delete','neon_compute_update_settings',
      'neon_database_list','neon_database_get','neon_role_list','neon_role_get',
      'neon_database_create','neon_database_update','neon_database_delete',
      'neon_role_create',
      'neon_role_reset_password',
      'neon_role_create_read_only','neon_role_delete','neon_role_retirement_review',
      'neon_connection_get_info','neon_connection_show_once','neon_sql_query','neon_sql_explain','neon_sql_list_activity','neon_sql_list_slow_queries','neon_sql_stop_query','neon_sql_preview_change','neon_sql_execute','neon_sql_execute_transaction','neon_schema_list_schemas','neon_schema_list_tables','neon_schema_describe_table','neon_schema_list_extensions','neon_schema_search','neon_schema_list_objects','neon_health_check','neon_health_suggest_indexes','neon_schema_generate_types','neon_schema_get_ddl','neon_schema_list_migrations','neon_branch_compare_data','neon_schema_enable_extension','neon_schema_disable_extension','neon_schema_create_index','neon_schema_drop_index','neon_health_reindex','neon_health_vacuum_analyze','neon_dev_branch_create','neon_dev_list_runs','neon_dev_cleanup','neon_write_guard_readiness','neon_dev_list_scenarios','neon_dev_seed','neon_dev_checkpoint','neon_dev_reset_branch',
      'neon_dev_restore_checkpoint','neon_dev_migration_preview',
      'neon_snapshot_list','neon_snapshot_delete','neon_snapshot_update','neon_snapshot_create','neon_snapshot_restore','neon_snapshot_set_schedule','neon_security_list_jwks','neon_security_review',
      'neon_security_set_public_access','neon_security_set_ip_allow',
      'neon_security_set_jwks','neon_security_set_audit_log_level',
      'neon_search_tools','neon_call','neon_batch','neon_describe_tool']);
    for(const tool of registry.tools) {
      if (tool.writes) {
        expect(tool.profiles).toEqual(['neon_project_rename','neon_branch_rename','neon_branch_set_expiration','neon_branch_create',
         'neon_compute_start','neon_compute_suspend','neon_compute_restart','neon_compute_update_settings'].includes(tool.name)?['everyday','full']:['full']);
        expect(tool.writeContract).toBe('defineWrite-v1');
      } else expect(tool.profiles).toContain(['neon_check_key_access','neon_role_retirement_review','neon_write_guard_readiness'].includes(tool.name)?'full':'read_only');
      expect(typeof registry.handlers[tool.name]).toBe('function');
    }
  });
  it('refuses duplicate tool names across namespaces', () => {
    expect(() => mergeNamespaces([make('neon_example'), make('neon_example')])).toThrow(/Duplicate/);
  });
  it('refuses a tool without a handler', () => {
    expect(() => mergeNamespaces([{ tools: [{ name: 'neon_broken' }], handlers: {} }])).toThrow(/Missing handler/);
  });
  it('merges distinct namespaces in order', () => {
    const merged = mergeNamespaces([make('neon_a'), make('neon_b')]);
    expect(merged.tools.map((t) => t.name)).toEqual(['neon_a', 'neon_b']);
    expect(typeof merged.handlers.neon_b).toBe('function');
  });
});
