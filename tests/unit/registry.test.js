import { describe, expect, it } from 'vitest';
import { mergeNamespaces } from '../../src/core/registry.js';
import { registry } from '../../src/tools/index.js';

const make = (name) => ({ tools: [{ name }], handlers: { [name]: async () => null } });
describe('tool registry', () => {
  it('keeps original reads and guarded owner controls plus B-8a scoped reads', () => {
    expect(registry.tools.map(t=>t.name)).toEqual(['neon_whoami','neon_list_accounts',
      'neon_enable_production','neon_disable_production',
      'neon_list_connections','neon_recent_changes','neon_get_settings','neon_where_is_setting','neon_revoke_connection','neon_check_key_access','neon_update_settings','neon_get_result','neon_project_list','neon_project_list_regions','neon_project_overview','neon_operation_list','neon_operation_get','neon_project_get_settings','neon_project_rename','neon_project_delete','neon_project_recover','neon_project_create','neon_search_tools','neon_call','neon_batch','neon_describe_tool']);
    for(const tool of registry.tools) {
      if (tool.writes) {
        expect(tool.profiles).toEqual(tool.name==='neon_project_rename'?['everyday','full']:['full']);
        expect(tool.writeContract).toBe('defineWrite-v1');
      } else expect(tool.profiles).toContain(tool.name==='neon_check_key_access'?'full':'read_only');
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
