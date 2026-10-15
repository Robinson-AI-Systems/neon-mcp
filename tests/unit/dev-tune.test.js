import {describe,it,expect,vi} from 'vitest';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {createDevTuneHandlers} from '../../src/tools/dev-tune.js';
const input={projectId:'proj-v4-tune',branchId:'br-v4-dev',
 runId:'run-v4-tune',endpointId:'ep-v4-dev',
 databaseName:'devdb',roleName:'devowner',
 query:'SELECT * FROM public.widgets WHERE status = $1 LIMIT 100',
 params:['rare']};
function fixture({blocked=false,appOwned=false,expired=false,
 protectedBranch=false,changed=false,unowned=false,pending=false}={}){
 const f=makeContractFixture({blocked,appOwned});
 const expiry=new Date(Date.now()+86400000).toISOString();
 f.ctx.connection={neonOrg:'org-v4',projectScope:input.projectId,
  profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:input.branchId,project_id:input.projectId,
  parent_id:'br-parent',protected:protectedBranch,default:false,
  expires_at:expired?'2020-01-01T00:00:00Z':expiry});
 f.ctx.db.getDevRun=async()=>unowned?null:{id:input.runId,status:'active'};
 f.ctx.db.listDevRunObjects=async()=>unowned?[]:[{
  run_id:input.runId,object_type:'branch',object_id:input.branchId,
  cleaned:false,expires_at:expiry}];
 f.ctx.clientFor=async()=>({trusted:true});
 const previewRunner=vi.fn(async args=>{
  expect(args.target.branchId).toBe(input.branchId);
  expect(args.tuneQuery).toBe(input.query);
  expect(args.tuneParams).toEqual(input.params);
  expect(args.keepChild).toBe(false);
  expect(args.statements).toHaveLength(1);
  expect(args.statements[0]).toContain('CREATE INDEX');
  expect(args.statements[0]).not.toContain('CONCURRENTLY');
  expect(args.ctx.allowFullTable).toBe(false);
  if(pending)return {done:false,code:'preview_cleanup_pending'};
  return {done:true,exact:true,childDeleted:true,tuning:{
   before:{executionMs:26,seqScans:['widgets']},
   after:{executionMs:4,seqScans:[]}}};
 });
 const built=createDevTuneHandlers({contextFor:async()=>f.ctx,
  verifyTarget:async()=>({pid:input.projectId,bid:input.branchId,
   endpointId:input.endpointId,database:input.databaseName,
   role:input.roleName,endpoint:{host:'dev.example.test'}}),
  previewRunner,sqlFactory:()=>async()=>null});
 return {...f,...built,previewRunner,
  call:a=>built.handlers.neon_dev_tune_query(a,{})};
}
const parse=r=>JSON.parse(r.content[0].text);
describe('V-4 full owner-priced disposable tuner handler',()=>{
 it('previews without mutation, confirms once, returns tested valid index advice',async()=>{
  const f=fixture();
  expect(f.tools[0]).toMatchObject({writes:true,destructive:true,
   profiles:['full'],writeContract:'defineWrite-v1'});
  expect(parse(await f.call({...input,dryRun:true})))
   .toMatchObject({done:false,needsConfirmation:true});
  expect(f.previewRunner).not.toHaveBeenCalled();
  const res=parse(await f.call({...input,confirm:true}));
  expect(res).toMatchObject({done:true,confirmed:true});
  expect(res.tuning).toMatchObject({beforeMs:26,afterMs:4,
   childDeleted:true,indexesTested:1});
  expect(res.tuning.suggestedIndexes).toHaveLength(1);
  expect(res.tuning.suggestedIndexes[0]).toContain('CREATE INDEX CONCURRENTLY');
  expect(res.tuning.recommendationTool).toBe('neon_schema_create_index');
  expect(f.previewRunner).toHaveBeenCalledTimes(1);
  expect(parse(await f.call({...input,confirm:true})).done).toBe(true);
  expect(f.previewRunner).toHaveBeenCalledTimes(1);
 });
 it('keeps pending on lost response or unconfirmed cleanup, never reissues index SQL',async()=>{
  const f=fixture({pending:true});
  expect(parse(await f.call({...input,confirm:true})))
   .toMatchObject({done:false,confirmed:'pending'});
  expect(parse(await f.call({...input,confirm:true})).confirmed).toBe('pending');
  expect(f.previewRunner).toHaveBeenCalledTimes(1);
 });
 it('denies protected, app-owned, expired, unowned and read-only targets',async()=>{
  for(const flags of [{blocked:true},{appOwned:true},{expired:true},
   {protectedBranch:true},{unowned:true}]){
   const f=fixture(flags);
   expect(parse(await f.call({...input,confirm:true})).done).toBe(false);
   expect(f.previewRunner).not.toHaveBeenCalled();
  }
  const f=fixture();f.ctx.connection.profile='read_only';
  expect(parse(await f.call({...input,confirm:true})).done).toBe(false);
  expect(f.previewRunner).not.toHaveBeenCalled();
 });
 it('refuses dangerous DML or multiline query before provisioning a child',async()=>{
  const f=fixture();
  expect(parse(await f.call({...input,
   query:'DELETE FROM public.widgets WHERE id = $1',confirm:true})).done).toBe(false);
  expect(f.previewRunner).not.toHaveBeenCalled();
 });
});