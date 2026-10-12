import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,operation} from '../../test/helpers/neon-fixtures.js';
import {projectScope} from '../../src/tools/project-context.js';
import {createOperationHandlers} from '../../src/tools/operations.js';
const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'}};
const json=result=>JSON.parse(result.content[0].text);
function setup({wait}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_D1_operations_fixture',orgId:IDS.org,fetch:fake.fetch,
  budget:{async consume(){return {allowed:true}}}});
 return {fake,handlers:createOperationHandlers({getClient:async(c,id)=>({client,scope:projectScope(c,id)}),wait})};
}
describe('D-1 operation/status and settings reads',()=>{
 it('lists safe operation records, with no provider mutation or secret',async()=>{
  const {fake,handlers}=setup();
  const op=operation({status:'finished'});
  fake.when('listProjectOperations').resolves({operations:[op]});
  const result=json(await handlers.neon_operation_list({projectId:IDS.project},ctx));
  expect(result.operations).toHaveLength(1);
  expect(result.operations[0].status).toBe('finished');
  expect(JSON.stringify(result)).not.toContain('endpoint_id');
  expect(fake.calls.map(x=>x.method)).toEqual(['GET']);
  fake.assertClean();
 });
 it('refuses cross-project operations even if Neon returns one',async()=>{
  const {fake,handlers}=setup();
  fake.when('listProjectOperations').resolves({operations:[operation({status:'finished',id:'fake-op-000001'})]});
  await expect(handlers.neon_operation_list({projectId:'outside'},ctx)).rejects.toThrow(/scope/);
  expect(fake.calls).toHaveLength(0);
 });
 it('gets exact operation and limits wait to caller budget',async()=>{
  const op=operation({status:'running'});let saved;
  const {fake,handlers}=setup({wait:async(_client,_project,ops,options)=>{
   saved=options;return {done:'pending',operations:ops};}});
  fake.when('getProjectOperation').resolves({operation:op});
  const result=json(await handlers.neon_operation_get({projectId:IDS.project,operationId:op.id,
   waitSeconds:2},ctx));
  expect(saved.budgetMs).toBe(2000);
  expect(result.done).toBe('pending');
  expect(result.next).toMatch(/neon_operation_get/);
  fake.assertClean();
 });
 it('only exposes allowlisted settings fields',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  const result=json(await handlers.neon_project_get_settings({projectId:IDS.project},ctx));
  expect(result.settings.historyRetentionSeconds).toBe(86400);
  expect(JSON.stringify(result)).not.toMatch(/password|proxy_host|owner_id|api_token/);
  fake.assertClean();
 });
});
