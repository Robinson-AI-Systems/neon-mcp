import { expect, it } from 'vitest';
import { makeFakeNeon } from '../../test/helpers/fake-neon.js';
import { IDS, operation } from '../../test/helpers/neon-fixtures.js';
import { makeNeonClient } from '../../src/neon/client.js';
import { waitForOperations } from '../../src/neon/operations.js';

function fixture() {
  const fake=makeFakeNeon();
  const budget={async consume(){return {allowed:true};}};
  return {fake, client:makeNeonClient({key:'napi_FAKE_waiter_fixture',orgId:IDS.org,
    budget,fetch:fake.fetch,sleep:async()=>{}})};
}
it('waits for operations and verifies terminal statuses', async()=>{
  const {fake,client}=fixture();
  const op=operation();
  fake.operations.add(op,{polls:1,outcome:'finished'});
  let t=1000;
  const result=await waitForOperations(client,IDS.project,[op],{
    now:()=>t,sleep:async ms=>{t+=ms;},pollIntervalMs:1000,budgetMs:6000});
  expect(result.done).toBe(true);
  expect(result.operations[0].status).toBe('finished');
  fake.assertClean();
});
it('stops after failure rather than claiming a write succeeded',async()=>{
  const {fake,client}=fixture();
  const op=operation();
  fake.operations.add(op,{polls:0,outcome:'failed',error:'test error'});
  const result=await waitForOperations(client,IDS.project,[op],{budgetMs:5000});
  expect(result.done).toBe(false);
  expect(result.code).toBe('operation_failed');
  expect(result.message).not.toContain('test error');
});
it('returns a resumable pending result when out of budget',async()=>{
  const {client}=fixture();
  const op=operation();
  const result=await waitForOperations(client,IDS.project,[op],{budgetMs:0});
  expect(result.done).toBe('pending');
  expect(result.confirmed).toBeNull();
  expect(result.next).toMatch(/neon_operation_get/);
});
