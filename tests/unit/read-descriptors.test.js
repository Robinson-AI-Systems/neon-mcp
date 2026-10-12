import {describe,it,expect} from 'vitest';
import {defineReadTool,readId,readSchema,readText} from '../../src/tools/read-descriptors.js';
describe('shared Neon read descriptors',()=>{
 it('preserves read-only profile, audience and closed schema without authorizing anything',()=>{
  const d=defineReadTool('neon_test_read','Inspect only scoped records.',{projectId:readId});
  expect(d).toMatchObject({writes:false,area:'projects',profiles:['read_only','everyday','full']});
  expect(d.inputSchema).toEqual(readSchema({projectId:readId}));
  expect(d.inputSchema.additionalProperties).toBe(false);
  expect(d.inputSchema.properties.projectId.pattern).toBe('^[a-z0-9-]{1,60}$');
 });
 it('does not share a mutable profiles array between tools',()=>{
  const a=defineReadTool('neon_a','Read A.',{});
  const b=defineReadTool('neon_b','Read B.',{},{area:'branches'});
  b.profiles.push('extra');
  expect(a.profiles).not.toContain('extra');
  expect(b.area).toBe('branches');
  expect(JSON.parse(readText({safe:true}).content[0].text)).toEqual({safe:true});
 });
});
