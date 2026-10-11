import { describe,expect,it } from 'vitest';
import { loadNeonSpec } from '../../test/helpers/neon-spec.js';
import { indexNeonOperations,searchNeonOperations,diffNeonOperations } from '../../src/neon/openapi-index.js';
const operations=indexNeonOperations(loadNeonSpec().spec);
describe('pinned Neon OpenAPI operation index',()=>{
  it('recognizes exactly 163 pinned operations, including project reads',()=>{
    expect(operations.length).toBe(163);
    expect(searchNeonOperations(operations,'getProject')).toEqual(expect.arrayContaining([
      expect.objectContaining({method:'GET',operationId:'getProject'})
    ]));
    expect(searchNeonOperations(operations,'branch',{limit:3}).length).toBeLessThanOrEqual(3);
  });
  it('compares additions/removals/renamed operation IDs',()=>{
    const a=[{method:'GET',path:'/x',operationId:'a',summary:'A'}];
    const b=[{method:'GET',path:'/x',operationId:'b',summary:'B'},
      {method:'POST',path:'/y',operationId:'c',summary:'C'}];
    expect(diffNeonOperations(a,b)).toMatchObject({
      added:[expect.objectContaining({operationId:'c'})],removed:[],
      changed:[{before:a[0],after:b[0]}]
    });
    expect(diffNeonOperations(b,a).removed).toHaveLength(1);
  });
  it('rejects invalid search limits and missing documents',()=>{
    expect(()=>searchNeonOperations(operations,'',{limit:1000})).toThrow(TypeError);
    expect(()=>indexNeonOperations(null)).toThrow(TypeError);
  });
});
