import { afterEach, describe, expect, it } from 'vitest';
import { makeFakeNeon, NEON_BASE_URL } from '../../test/helpers/fake-neon.js';
import * as fx from '../../test/helpers/neon-fixtures.js';

const auth = { authorization: 'Bearer napi_FAKE_unit_test_key' };
const call = (fake, method, path, body) => fake.fetch(`${NEON_BASE_URL}${path}`, {
  method, headers: { ...auth, ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});
let fake;
afterEach(() => { fake = undefined; });

describe('fake Neon: requests are checked against the vendored API description', () => {
  it('fails an undocumented path and names it', async () => {
    fake = makeFakeNeon();
    await expect(call(fake, 'GET', `/projects/${fx.IDS.project}/no-such-thing`)).rejects.toThrow(/\/projects\/proj-fake-000001\/no-such-thing is not in the Neon API description/);
    expect(fake.problems).toHaveLength(1);
    expect(() => fake.assertClean()).toThrow(/no-such-thing/);
  });
  it('fails a documented path with the wrong method', async () => {
    fake = makeFakeNeon();
    await expect(call(fake, 'PUT', `/projects/${fx.IDS.project}/branches`)).rejects.toThrow(/PUT .* is not in the Neon API description/);
  });
  it('records a documented create-branch call with its operationId, path params and body', async () => {
    fake = makeFakeNeon();
    fake.when('createProjectBranch').resolves(fx.responses.createProjectBranch());
    const res = await call(fake, 'POST', `/projects/${fx.IDS.project}/branches`, { branch: { parent_id: fx.IDS.main, name: 'dev' } });
    expect(res.status).toBe(201);
    expect((await res.json()).branch.id).toBe(fx.IDS.dev);
    expect(fake.calls).toEqual([{ operationId: 'createProjectBranch', method: 'POST', path: `/projects/${fx.IDS.project}/branches`,
      params: { project_id: fx.IDS.project }, query: {}, body: { branch: { parent_id: fx.IDS.main, name: 'dev' } }, auth: true }]);
    fake.assertClean();
  });
  it('fails a request body with an unknown (misspelled) field', async () => {
    fake = makeFakeNeon();
    fake.when('createProjectBranch').resolves(fx.responses.createProjectBranch());
    await expect(call(fake, 'POST', `/projects/${fx.IDS.project}/branches`, { branch: { nmae: 'dev' } })).rejects.toThrow(/body\.branch\.nmae: unknown field/);
  });
  it('fails a request body missing a required field', async () => {
    fake = makeFakeNeon();
    await expect(call(fake, 'POST', `/projects/${fx.IDS.project}/branches/${fx.IDS.dev}/databases`, { database: { name: 'app' } }))
      .rejects.toThrow(/body\.database\.owner_name: required field missing/);
  });
  it('fails an unknown query parameter', async () => {
    fake = makeFakeNeon();
    await expect(call(fake, 'GET', `/projects/${fx.IDS.project}/branches?shoe_size=9`)).rejects.toThrow(/query\.shoe_size: unknown parameter/);
  });
  it('answers 401 without a bearer key, like Neon', async () => {
    fake = makeFakeNeon();
    fake.when('getProject').resolves(fx.responses.getProject());
    const res = await fake.fetch(`${NEON_BASE_URL}/projects/${fx.IDS.project}`);
    expect(res.status).toBe(401);
    expect(fake.calls[0].auth).toBe(false);
  });
  it('refuses an unconfigured documented call instead of inventing data', async () => {
    fake = makeFakeNeon();
    await expect(call(fake, 'GET', `/projects/${fx.IDS.project}`)).rejects.toThrow(/unconfigured call getProject/);
  });
  it('refuses a fixture that does not match the described response', () => {
    fake = makeFakeNeon();
    expect(() => fake.when('getProject').resolves({ project: { id: 'x' } })).toThrow(/does not match the description/);
    expect(() => fake.when('notAnOperation')).toThrow(/unknown operationId/);
  });
});

describe('fake Neon: operations, 423 and 429', () => {
  it('reports operations running, then finished', async () => {
    fake = makeFakeNeon();
    const body = fx.responses.createProjectBranch();
    fake.when('createProjectBranch').resolves(body);
    fake.operations.finishAfter(2);
    await call(fake, 'POST', `/projects/${fx.IDS.project}/branches`, { branch: { name: 'dev' } });
    const id = body.operations[0].id;
    const poll = async () => (await (await call(fake, 'GET', `/projects/${fx.IDS.project}/operations/${id}`)).json()).operation.status;
    expect([await poll(), await poll(), await poll(), await poll()]).toEqual(['running', 'running', 'finished', 'finished']);
    expect(fake.calls.filter((c) => c.operationId === 'getProjectOperation')).toHaveLength(4);
  });
  it('reports a failed operation with its error', async () => {
    fake = makeFakeNeon();
    const op = fake.operations.add(fx.operation({ action: 'start_compute' }));
    fake.operations.fail(op.id, { error: 'compute failed to start', polls: 1 });
    const get = async () => (await (await call(fake, 'GET', `/projects/${fx.IDS.project}/operations/${op.id}`)).json()).operation;
    expect((await get()).status).toBe('running');
    expect(await get()).toMatchObject({ status: 'failed', error: 'compute failed to start' });
  });
  it('places operations given with resolves() on the body and registers them', async () => {
    fake = makeFakeNeon();
    const op = fx.operation({ action: 'apply_config', endpointId: fx.IDS.devEndpoint });
    fake.when('updateProjectEndpoint').resolves({ endpoint: fx.devEndpoint() }, { operations: [op] });
    const res = await call(fake, 'PATCH', `/projects/${fx.IDS.project}/endpoints/${fx.IDS.devEndpoint}`, { endpoint: { autoscaling_limit_max_cu: 2 } });
    expect((await res.json()).operations[0].id).toBe(op.id);
    expect(fake.operations.ids()).toContain(op.id);
  });
  it('returns 404 for an unknown operation', async () => {
    fake = makeFakeNeon();
    expect((await call(fake, 'GET', `/projects/${fx.IDS.project}/operations/fake-op-unknown`)).status).toBe(404);
  });
  it('plays a 423 Locked then 200 sequence', async () => {
    fake = makeFakeNeon();
    fake.lockedThen('getProject', fx.responses.getProject(), { times: 1 });
    const first = await call(fake, 'GET', `/projects/${fx.IDS.project}`);
    const second = await call(fake, 'GET', `/projects/${fx.IDS.project}`);
    expect([first.status, second.status]).toEqual([423, 200]);
    expect((await first.json()).message).toMatch(/running conflicting operations/);
  });
  it('plays a 429 sequence with Retry-After, and the last response repeats', async () => {
    fake = makeFakeNeon();
    fake.rateLimited('listProjectBranches', { times: 3, retryAfter: 2 });
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await call(fake, 'GET', `/projects/${fx.IDS.project}/branches`);
      statuses.push([res.status, res.headers.get('retry-after')]);
    }
    expect(statuses).toEqual([[429, '2'], [429, '2'], [429, '2'], [429, '2']]);
  });
  it('accepts a fetch Request object as well as a URL string', async () => {
    fake = makeFakeNeon();
    fake.when('listProjectBranches').resolves(fx.responses.listProjectBranches());
    const res = await fake.fetch(new Request(`${NEON_BASE_URL}/projects/${fx.IDS.project}/branches?limit=10`, { headers: auth }));
    expect(res.status).toBe(200);
    expect(fake.calls[0].query).toEqual({ limit: '10' });
  });
  it('refuses a request to any other host', async () => {
    fake = makeFakeNeon();
    await expect(fake.fetch('https://example.test/api/v2/projects', { headers: auth })).rejects.toThrow(/outside the Neon API base URL/);
  });
});
