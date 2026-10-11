import { describe, expect, it } from 'vitest';
import { mergeNamespaces } from '../../src/core/registry.js';
import { registry } from '../../src/tools/index.js';

const make = (name) => ({ tools: [{ name }], handlers: { [name]: async () => null } });
describe('tool registry', () => {
  it('keeps two A-5 reads plus only the two guarded B-2 owner controls', () => {
    expect(registry.tools.map(t=>t.name)).toEqual(['neon_whoami','neon_list_accounts',
      'neon_enable_production','neon_disable_production']);
    for(const tool of registry.tools) {
      if (tool.writes) {
        expect(tool.profiles).toEqual(['full']);
        expect(tool.writeContract).toBe('defineWrite-v1');
      } else expect(tool.profiles).toContain('read_only');
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
