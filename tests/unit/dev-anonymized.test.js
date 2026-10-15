import {describe,it,expect,vi} from 'vitest';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {createDevAnonymizedHandlers} from '../../src/tools/dev-anonymized.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {applyNeonWrite} from '../../src/neon/write-neon.js';
import * as fx from '../../test/helpers/neon-fixtures.js';
const key='rmcp_mask_test_abcdef123456789';
const input={projectId:fx.IDS.project,sourceBranchId:fx.IDS.main,
 endpointId:fx.IDS.mainEndpoint,runId:'run-v4-masked',
 databaseName:'neondb',roleName:'neondb_owner',
 rules:[{schemaName:'public',tableName:'customers',columnName:'email',preset:'email'},
  {schemaName:'public',tableName:'customers',columnName:'name',preset:'text'}]};
const rows=[
 {schema_name:'public',table_name:'customers',column_name:'id',data_type:'int4'},
 {schema_name:'public',table_name:'customers',column_name:'email',data_type:'text'},
 {schema_name:'public',table_name:'customers',column_name:'name',data_type:'text'}
];
function fixture({blocked=false,appOwned=false,invalidStatus=false}={}){
 const f=makeContractFixture({blocked,appOwned});
 const fake=makeFakeNeon();
 fake.when('getProject').resolves({project:fx.project({
  owner_id:fx.IDS.org,owner:{branches_limit:10,subscription_type:'launch',
   email:'owner@example.test',name:'Synthetic Owner'}})});
 fake.when('listProjectBranches').resolves(fx.responses.listProjectBranches());
 const client=makeNeonClient({key:'napi_FAKE_v4_key',orgId:fx.IDS.org,
  budget:{consume:async()=>({allowed:true})},fetch:fake.fetch});
 f.ctx.connection={neonOrg:fx.IDS.org,projectScope:fx.IDS.project,
  profile:'full',mode:'preview'};
 f.ctx.clientFor=async()=>client;
 f.ctx.getBranch=async()=>fx.mainBranch();
 f.ctx.writeKey=()=>key;
 f.ctx.db.getDevSettings=async()=>({ttl_hours:24,compute:{
  min_cu:0.25,max_cu:1,suspend_seconds:300}});
 f.ctx.db.getDevRun=async()=>null;
 f.ctx.db.reserveDevRun=vi.fn(async()=>({id:input.runId}));
 f.ctx.db.recordDevRunBranch=vi.fn(async()=>true);
 const createBranch=vi.fn(async()=>({confirmed:true,
  data:{branch:{id:'br-masked-new',project_id:fx.IDS.project}},operations:[]}));
 const observe=vi.fn(async()=>invalidStatus?{valid:false,state:'anonymizing'}:
  {valid:true,state:'anonymized'});
 const built=createDevAnonymizedHandlers({contextFor:async()=>f.ctx,
  verifyTarget:async()=>({pid:fx.IDS.project,bid:fx.IDS.main,
   endpointId:fx.IDS.mainEndpoint,database:'neondb',
   role:'neondb_owner',endpoint:{host:'ep-fake.dev.test'}}),
  priceFor:async()=>({increaseCents:1,estimate:true,canApply:true}),
  readColumns:async()=>rows,createBranch,observe});
 return {...f,...built,fake,createBranch,observe,
  call:a=>built.handlers.neon_dev_anonymized_copy(a,{})};
}
const parse=r=>JSON.parse(r.content[0].text);
describe('V-4 owner-confirmed anonymized development copy lifecycle',()=>{
 it('refuses missing email rule before any possible source mutation',async()=>{
  const f=fixture();
  const bad={...input,rules:input.rules.filter(r=>r.columnName!=='email')};
  expect(parse(await f.call({...bad,confirm:true})).done).toBe(false);
  expect(f.createBranch).not.toHaveBeenCalled();
  expect(f.ctx.db.reserveDevRun).not.toHaveBeenCalled();
 });
 it('previews complete masks, confirms once, and records only an expiring child',async()=>{
  const f=fixture();
  const preview=parse(await f.call({...input,dryRun:true}));
  expect(preview).toMatchObject({done:false,needsConfirmation:true});
  expect(preview.preview).toContain('columns masked');
  expect(f.createBranch).not.toHaveBeenCalled();
  const result=parse(await f.call({...input,confirm:true}));
  expect(result).toMatchObject({done:true,confirmed:true});
  expect(f.createBranch).toHaveBeenCalledTimes(1);
  const body=f.createBranch.mock.calls[0][0].params.body;
  expect(body).toMatchObject({start_anonymization:true,
   branch_create:{branch:{parent_id:fx.IDS.main,protected:false,
    init_source:'parent-data'}}});
  expect(body.masking_rules).toHaveLength(2);
  expect(body.masking_rules.map(r=>r.masking_function)).toContain('anon.fake_email()');
  expect(body.branch_create.branch.expires_at).toMatch(/Z$/);
  expect(body.annotation_value).toMatchObject({rtc_run:input.runId,rtc_request:key});
  expect(f.ctx.db.recordDevRunBranch).toHaveBeenCalledWith(expect.objectContaining({
   branchId:'br-masked-new',parentId:fx.IDS.main,runId:input.runId}));
  expect(parse(await f.call({...input,confirm:true})).done).toBe(true);
  expect(f.createBranch).toHaveBeenCalledTimes(1);
  f.fake.assertClean();
 });
 it('never claims anonymization when beta status remains incomplete',async()=>{
  const f=fixture({invalidStatus:true});
  expect(parse(await f.call({...input,confirm:true})))
   .toMatchObject({done:false,confirmed:'pending'});
  expect(f.createBranch).toHaveBeenCalledTimes(1);
  expect(parse(await f.call({...input,confirm:true})).confirmed).toBe('pending');
  expect(f.createBranch).toHaveBeenCalledTimes(1);
 });
 it('refuses protected/app-owned and non-owner modes before the provider call',async()=>{
  for(const flags of [{blocked:true},{appOwned:true}]){
   const f=fixture(flags),out=parse(await f.call({...input,confirm:true}));
   expect(out.done).toBe(false);
   expect(f.createBranch).not.toHaveBeenCalled();
  }
  const readonly=fixture();readonly.ctx.connection.profile='read_only';
  expect(parse(await readonly.call({...input,confirm:true})).done).toBe(false);
  expect(readonly.createBranch).not.toHaveBeenCalled();
 });
 it('validates current pinned Neon beta anonymization request shape',async()=>{
  const fake=makeFakeNeon();
  fake.when('createProjectBranchAnonymized').resolves(fx.responses.createProjectBranch());
  const client=makeNeonClient({key:'napi_FAKE_masked_shape',orgId:fx.IDS.org,
   budget:{consume:async()=>({allowed:true})},fetch:fake.fetch});
  const exp=new Date(Date.now()+86400000).toISOString().replace('.000Z','Z');
  const body={branch_create:{branch:{parent_id:fx.IDS.main,
   name:'masked-fixture',expires_at:exp,protected:false,
   init_source:'parent-data'},endpoints:[{type:'read_write',
    autoscaling_limit_min_cu:0.25,autoscaling_limit_max_cu:1,
    suspend_timeout_seconds:300}]},annotation_value:{rtc_run:input.runId,
    rtc_request:key},masking_rules:[{database_name:'neondb',
    schema_name:'public',table_name:'customers',column_name:'email',
    masking_function:'anon.fake_email()'}],start_anonymization:true};
  const result=await applyNeonWrite({client,projectId:fx.IDS.project,
   operationId:'createProjectBranchAnonymized',
   params:{path:{project_id:fx.IDS.project},body},requestKey:key});
  expect(result.confirmed).toBe(true);
  expect(fake.calls[0].operationId).toBe('createProjectBranchAnonymized');
  expect(fake.calls[0].body).toEqual(body);
  fake.assertClean();
 });
});