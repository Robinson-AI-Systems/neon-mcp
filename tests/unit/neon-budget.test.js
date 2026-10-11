import { describe, expect, it } from 'vitest';
import { makeNeonBudget } from '../../src/neon/budget.js';
describe('database-backed API budget', () => {
  it('hashes keys and limits budgets to less than provider ceiling',async()=>{
    const calls=[];
    const db={async consumeApiBudget(input){calls.push(input);return {allowed:true,count:1};}};
    const budget=makeNeonBudget({db,apiKey:'napi_FAKE_budget_fixture',now:()=>121001});
    expect(await budget.consume()).toEqual({allowed:true,count:1});
    expect(calls[0].keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(calls)).not.toContain('napi_FAKE_budget_fixture');
    expect(calls[0].windowStart.toISOString()).toBe('1970-01-01T00:02:00.000Z');
    expect(()=>makeNeonBudget({db,apiKey:'x',limitPerMinute:700})).toThrow(RangeError);
    expect(()=>makeNeonBudget({apiKey:'x'})).toThrow(/database-backed/);
  });
  it('returns the remaining time to a new minute on rejection',async()=>{
    const db={async consumeApiBudget(){return {allowed:false,count:500};}};
    const budget=makeNeonBudget({db,apiKey:'napi_FAKE_budget_fixture',now:()=>121001});
    expect(await budget.consume()).toEqual({allowed:false,count:500,retryAfterSeconds:59});
    await expect(budget.consume({calls:10})).rejects.toThrow(/one budget slot/);
  });
  it('never admits callers when the database is down',async()=>{
    const db={async consumeApiBudget(){throw new Error('db unavailable');}};
    await expect(makeNeonBudget({db,apiKey:'napi_FAKE_budget_fixture'}).consume())
      .rejects.toThrow('db unavailable');
  });
});
