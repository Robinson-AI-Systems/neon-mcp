// Proves fake Neon works behind the official client (BATCH-A §0 row A2: @neon/sdk accepts a custom fetch).
// Only src/neon/client.js may import @neon/sdk in production code (A-4 adds that grep test); tests may.
import { describe, expect, it } from 'vitest';
import { createNeonClient } from '@neon/sdk';
import { createProjectBranch, getProject } from '@neon/sdk/raw';
import { makeFakeNeon } from '../../test/helpers/fake-neon.js';
import { call, makeNeonClient } from '../../src/neon/client.js';
import * as fx from '../../test/helpers/neon-fixtures.js';

const client = (fake) => createNeonClient({ apiKey: 'napi_FAKE_sdk_test_key', fetch: fake.fetch, retries: 0 }).client;

describe('fake Neon behind @neon/sdk raw functions', () => {
  it('serves a raw getProject call and records it', async () => {
    const fake = makeFakeNeon();
    fake.when('getProject').resolves(fx.responses.getProject());
    const { data, error } = await getProject({ client: client(fake), path: { project_id: fx.IDS.project } });
    expect(error).toBeUndefined();
    expect(data.project.id).toBe(fx.IDS.project);
    expect(fake.calls).toMatchObject([{ operationId: 'getProject', auth: true }]);
    fake.assertClean();
  });
  it('validates the body the SDK actually sends', async () => {
    const fake = makeFakeNeon();
    fake.when('createProjectBranch').resolves(fx.responses.createProjectBranch());
    const { data } = await createProjectBranch({ client: client(fake), path: { project_id: fx.IDS.project },
      body: { branch: { parent_id: fx.IDS.main, name: 'dev' }, endpoints: [{ type: 'read_write' }] } });
    expect(data.operations).toHaveLength(2);
    expect(fake.calls[0].body).toEqual({ branch: { parent_id: fx.IDS.main, name: 'dev' }, endpoints: [{ type: 'read_write' }] });
  });
  it('surfaces a misspelled field through the SDK as a recorded problem', async () => {
    const fake = makeFakeNeon();
    fake.when('createProjectBranch').resolves(fx.responses.createProjectBranch());
    const result = await createProjectBranch({ client: client(fake), path: { project_id: fx.IDS.project }, body: { branch: { nmae: 'x' } } })
      .catch((e) => ({ thrown: e }));
    expect(result.data).toBeUndefined();
    expect(() => fake.assertClean()).toThrow(/body\.branch\.nmae: unknown field/);
  });
  it('passes a 423 through to the caller when retries are off', async () => {
    const fake = makeFakeNeon();
    fake.lockedThen('getProject', fx.responses.getProject());
    const first = await getProject({ client: client(fake), path: { project_id: fx.IDS.project } });
    expect(first.error).toBeDefined();
    expect(first.error.status ?? first.response?.status).toBe(423);
    const second = await getProject({ client: client(fake), path: { project_id: fx.IDS.project } });
    expect(second.data.project.id).toBe(fx.IDS.project);
  });
  it('routes SDK raw-missing branch recovery through the configured low-level client', async () => {
    const fake = makeFakeNeon();
    fake.when('recoverProjectBranch').resolves({
      branch: fx.devBranch(), endpoints: [fx.devEndpoint()]
    });
    const scoped = makeNeonClient({ key: 'napi_FAKE_branch_recovery',
      orgId: fx.IDS.org, fetch: fake.fetch,
      budget: { async consume(){ return { allowed:true }; } } });
    const result = await call(scoped, 'recoverProjectBranch', {
      path: { project_id: fx.IDS.project, branch_id: fx.IDS.dev }
    }, { write:true, requestKey:'rmcp_fake_recover_123456789' });
    expect(result.error).toBeUndefined();
    expect(result.confirmed).toBe(true);
    expect(result.data.branch.id).toBe(fx.IDS.dev);
    expect(fake.calls).toMatchObject([{operationId:'recoverProjectBranch',
      method:'POST',auth:true,path:`/projects/${fx.IDS.project}/branches/${fx.IDS.dev}/recover`}]);
    fake.assertClean();
  });

});
