import { describe, expect, it } from 'vitest';
import { loadNeonSpec, validateResponse } from '../../test/helpers/neon-spec.js';
import * as fx from '../../test/helpers/neon-fixtures.js';
import { scanText } from '../../scripts/check-secrets.mjs';

const index = loadNeonSpec();
const statusFor = (op) => (index.byId.get(op).op.responses['200'] ? 200 : 201);

describe('Neon fixtures match the vendored API description', () => {
  for (const [operationId, make] of Object.entries(fx.responses)) {
    it(`${operationId} response body is valid`, () => {
      expect(validateResponse(index, operationId, statusFor(operationId), make())).toEqual([]);
    });
  }
  it('a single operation and the dev branch read are valid', () => {
    expect(validateResponse(index, 'getProjectOperation', 200, { operation: fx.operation() })).toEqual([]);
    expect(validateResponse(index, 'getProjectBranch', 200, fx.responses.getProjectBranch('dev'))).toEqual([]);
  });
  it('the project shape is the one later cards rely on', () => {
    const [main, dev] = fx.responses.listProjectBranches().branches;
    expect(main).toMatchObject({ name: 'main', default: true, protected: true });
    expect(dev).toMatchObject({ name: 'dev', default: false, protected: false, parent_id: main.id });
  });
  it('uses only made-up IDs that the secret scan accepts', () => {
    expect(scanText(JSON.stringify(fx.responses.createProjectBranch()) + JSON.stringify(fx.responses.listProjectEndpoints()))).toEqual([]);
    expect(Object.values(fx.IDS).every((id) => id.includes('fake'))).toBe(true);
  });
  it('the validator itself rejects a wrong type, a bad enum and a missing field', () => {
    const bad = { endpoints: [{ ...fx.mainEndpoint(), type: 'read_maybe', autoscaling_limit_min_cu: 'small' }] };
    delete bad.endpoints[0].host;
    const errors = validateResponse(index, 'listProjectEndpoints', 200, bad).join('\n');
    expect(errors).toMatch(/type: "read_maybe" is not one of/);
    expect(errors).toMatch(/autoscaling_limit_min_cu: expected number, got string/);
    expect(errors).toMatch(/host: required field missing/);
  });
});

describe('the validator agrees with Neon\'s own examples', () => {
  it('every request and response example in the description validates (requests strictly)', async () => {
    const { validate, resolveRef } = await import('../../test/helpers/neon-spec.js');
    const failures = [];
    let count = 0;
    for (const route of index.routes) {
      const rb = route.op.requestBody && resolveRef(index.spec, route.op.requestBody).content?.['application/json'];
      const groups = [[rb, true], ...Object.values(route.op.responses).map((r) => [resolveRef(index.spec, r).content?.['application/json'], false])];
      for (const [content, strict] of groups) {
        if (!content) continue;
        const examples = [...Object.values(content.examples || {}).map((e) => resolveRef(index.spec, e).value), ...(content.example ? [content.example] : [])];
        for (const ex of examples) {
          count += 1;
          const errors = validate(index.spec, content.schema, ex, { strict });
          if (errors.length) failures.push(`${route.operationId}: ${errors[0]}`);
        }
      }
    }
    expect(count).toBeGreaterThan(50);
    expect(failures).toEqual([]);
  });
});
