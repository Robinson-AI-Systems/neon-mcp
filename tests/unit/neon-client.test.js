import { describe, expect, it } from 'vitest';
import { makeFakeNeon } from '../../test/helpers/fake-neon.js';
import * as fx from '../../test/helpers/neon-fixtures.js';
import { makeNeonClient, call, requestKey, listAll } from '../../src/neon/client.js';

const client = (fake, budget = { calls: 0, async consume() { this.calls++; return { allowed: true }; } }) =>
  ({ client: makeNeonClient({ key: 'napi_FAKE_sdk_client_fixture', orgId: fx.IDS.org,
    budget, fetch: fake.fetch, sleep: async () => {} }), budget });

describe('A-4a single official Neon API client and safe retries', () => {
  it('fails closed without API budget and never needs a real Neon key', () => {
    expect(() => makeNeonClient({ key: 'napi_FAKE_missing_budget' })).toThrow(/durable API budget/);
    expect(() => makeNeonClient({ budget: { consume: async () => {} } })).toThrow(/key/);
  });
  it('makes an OpenAPI-validated read using only a budgeted raw operation', async () => {
    const fake = makeFakeNeon();
    fake.when('getProject').resolves(fx.responses.getProject());
    const {client: c,budget} = client(fake);
    const result = await call(c, 'getProject', { path: { project_id: fx.IDS.project } });
    expect(result.data.project.id).toBe(fx.IDS.project);
    expect(budget.calls).toBe(1);
    expect(fake.calls).toMatchObject([{ operationId: 'getProject', auth: true }]);
    fake.assertClean();
  });
  it('retries 423 only when within time budget; counts every API attempt', async () => {
    const fake = makeFakeNeon();
    fake.lockedThen('getProject', fx.responses.getProject());
    const {client: c,budget} = client(fake);
    const result = await call(c, 'getProject', { path: { project_id: fx.IDS.project } });
    expect(result.data.project.id).toBe(fx.IDS.project);
    expect(fake.calls).toHaveLength(2);
    expect(budget.calls).toBe(2);
  });
  it('refuses API calls when budget is exhausted without touching Neon', async () => {
    const fake = makeFakeNeon();
    const budget = { async consume() { return { allowed: false, retryAfterSeconds: 30 }; } };
    const { client: c } = client(fake,budget);
    const result = await call(c,'getProject',{path:{project_id: fx.IDS.project}});
    expect(result.error.code).toBe('rate_limited');
    expect(result.error.retryAfterSeconds).toBe(30);
    expect(fake.calls).toHaveLength(0);
  });
  it('never resends an uncertain create and only reads annotations to investigate', async () => {
    const fake = makeFakeNeon();
    fake.when('createProjectBranch').rejects(500, { code: '', message: 'unknown result' });
    fake.when('listProjectBranches').resolves(fx.responses.listProjectBranches());
    const {client:c} = client(fake);
    const result = await call(c, 'createProjectBranch', { path: { project_id: fx.IDS.project },
      body: { branch: { parent_id: fx.IDS.main, name: 'dev' } } },
    {write:true,requestKey:'rmcp_fake_create_12345678'});
    expect(result.confirmed).toBeNull();
    expect(result.error.code).toBe('unknown_outcome');
    expect(fake.calls.map(x=>x.operationId)).toEqual(['createProjectBranch', 'listProjectBranches']);
  });
  it('requires write idempotency keys and rejects non-existent raw SDK methods', async () => {
    const fake = makeFakeNeon();
    const {client:c} = client(fake);
    await expect(call(c,'createProjectBranch',{}, {write:true})).rejects.toThrow(/request key/);
    await expect(call(c,'definitelyNotNeon',{})).rejects.toThrow(/not supported/);
  });
  it('makes stable canonical operation request keys across preview knobs and 10-minute buckets', () => {
    const ctx = {neonOrg:fx.IDS.org, projectId:fx.IDS.project};
    const base = requestKey(ctx,'neon_branch_create',{branch:{name:'demo',parent:'test'},confirm:false},{now:600000});
    expect(base).toBe(requestKey(ctx,'neon_branch_create',{branch:{parent:'test',name:'demo'},dryRun:true,fields:['id'],detail:true},{now:600000}));
    expect(base).not.toBe(requestKey(ctx,'neon_branch_create',{branch:{name:'demo',parent:'test'}},{now:1200000}));
    expect(requestKey(ctx,'neon_branch_create',{requestKey:'custom-key-12345'})).toBe('custom-key-12345');
  });
  it('paginates with a hard cap, detects repeated cursors and never silently truncates', async () => {
    const calls=[];
    const fn = async (q) => { calls.push(q.cursor ?? null); return {data:q.cursor
      ? {projects:[{id:'b'}],pagination:{next:null}}
      : {projects:[{id:'a'}],pagination:{next:'cursor'}}}; };
    expect(await listAll(fn, {org_id:fx.IDS.org})).toEqual({items:[{id:'a'},{id:'b'}],capped:false});
    expect(calls).toEqual([null,'cursor']);
    expect((await listAll(fn,{},{max:1})).capped).toBe(true);
    const loop = async () => ({ data:{projects:[],pagination:{next:'same'}} });
    await expect(listAll(loop,{})).rejects.toThrow(/repeated pagination/);
  });
});
