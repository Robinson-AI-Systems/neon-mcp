import {describe,it,expect,vi} from 'vitest';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {createDevMigrationHandlers} from '../../src/tools/dev-migration-preview.js';
const ids={projectId:'proj-migration-v3',branchId:'br-migration-v3',
 runId:'run-migration-v3',endpointId:'ep-migration-v3',
 databaseName:'devdb',roleName:'devrole'};
const input={...ids,schemaName:'public',statements:[
 'ALTER TABLE widgets ADD COLUMN archived boolean'
]};
function fixture({drift=false,blocked=false,appOwned=false,
 expired=false,unowned=false,pending=false,badDelete=false,
 badKeep=false,previewThrow=false}={}){
 const f=makeContractFixture({blocked,appOwned});
 const expiry=new Date(Date.now()+86400000).toISOString();
 f.ctx.connection={neonOrg:'org-mig-v3',projectScope:ids.projectId,
  profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:ids.branchId,project_id:ids.projectId,
  parent_id:'br-parent',protected:false,default:false,
  expires_at:expired?'2020-01-01T00:00:00Z':expiry});
 f.ctx.db.getDevRun=async()=>unowned?null:{id:ids.runId,status:'active'};
 f.ctx.db.listDevRunObjects=async()=>unowned?[]:[{
  run_id:ids.runId,object_type:'branch',object_id:ids.branchId,
  cleaned:false,expires_at:expiry,parent_id:'br-parent'}];
 f.ctx.clientFor=async()=>({trusted:true});
 let planned=0;
 const makePlan=vi.fn(async()=>{
  planned++;
  return {fingerprint:drift&&planned>1?'unexpected':'stable',mode:'inline',
   schema:'public',statements:input.statements,params:[[]],
   alreadyApplied:[],warnings:[{statement:1,table:'widgets',
    estimatedRows:250000,reason:'Potential ACCESS EXCLUSIVE lock'}],
   filenames:['inline_1'],anyFullTable:false};
 });
 const previewRunner=vi.fn(async opts=>{
  if(previewThrow)throw Error('Provider ambiguous');
  expect(opts.target.projectId).toBe(ids.projectId);
  expect(opts.target.branchId).toBe(ids.branchId);
  expect(opts.target.database).toBe(ids.databaseName);
  expect(opts.statements).toEqual(input.statements);
  expect(opts.ctx.allowFullTable).toBe(false);
  if(pending)return {done:false,code:'preview_cleanup_pending'};
  expect(opts.captureDiagnostics).toBe(true);
  return {done:true,exact:true,affectedRows:[0],schemaChanged:true,
   statementDurationsMs:[7],schemaDiff:'ALTER TABLE widgets ADD COLUMN archived boolean',
   schemaHash:'abcd1234',
   ...(opts.keepChild?{childKept:!badKeep,childDeleted:false,
    childBranchId:'br-kept',childExpiresAt:'2026-10-14T23:00:00Z'}:
    {childDeleted:!badDelete,childKept:false})};
 });
 const saveKeptChild=vi.fn(async()=>true);
 const built=createDevMigrationHandlers({contextFor:async()=>f.ctx,
  verifyTarget:async()=>({pid:ids.projectId,bid:ids.branchId,
   endpointId:ids.endpointId,database:ids.databaseName,
   role:ids.roleName,endpoint:{host:'fake.dev.test'}}),
  sqlFactory:()=>async()=>null,
  makePlan,previewRunner,saveKeptChild});
 return {...f,...built,previewRunner,makePlan,saveKeptChild,
  call:a=>built.handlers.neon_dev_migration_preview(a,{})};
}
const result=r=>JSON.parse(r.content[0].text);
describe('V-3 run-owned price-gated disposable migration rehearsal',()=>{
 it('never creates a child on preview, demands an independently admitted owner-confirmed write',async()=>{
  const f=fixture();
  expect(f.tools[0]).toMatchObject({name:'neon_dev_migration_preview',
   writes:true,writeContract:'defineWrite-v1',destructive:true,
   spend:true,productionEffect:'none',profiles:['full']});
  expect(f.tools[0].inputSchema.additionalProperties).toBe(false);
  expect(result(await f.call({...input,dryRun:true}))).toMatchObject({
   done:false,needsConfirmation:true,spendMonthCents:1});
  expect(f.previewRunner).not.toHaveBeenCalled();
  expect(result(await f.call(input)).code).toBe('needs_confirmation');
  expect(f.previewRunner).not.toHaveBeenCalled();
  const out=result(await f.call({...input,confirm:true}));
  expect(out).toMatchObject({done:true,confirmed:true});
  expect(out.migrationPreview).toMatchObject({
   kept:false,statementCount:1,affectedRows:[0],
   schemaChanged:true,pendingMigrations:['inline_1'],
   statementDurationsMs:[7],schemaDiff:'ALTER TABLE widgets ADD COLUMN archived boolean'});
  expect(out.migrationPreview.lockWarnings).toHaveLength(1);
  expect(f.previewRunner).toHaveBeenCalledTimes(1);
  expect(f.previewRunner.mock.calls[0][0].keepChild).toBe(false);
  const replay=result(await f.call({...input,confirm:true}));
  expect(replay.done).toBe(true);
  expect(f.previewRunner).toHaveBeenCalledTimes(1);
 });
 it('records an expiring child for keep mode without returning a reusable SQL token',async()=>{
  const f=fixture();
  const out=result(await f.call({...input,keep:true,confirm:true}));
  expect(out).toMatchObject({done:true,confirmed:true});
  expect(out.migrationPreview).toMatchObject({
   kept:true,branchId:'br-kept',statementCount:1});
  expect(out.migrationPreview.previewToken).toBeUndefined();
  expect(f.previewRunner.mock.calls[0][0].keepChild).toBe(true);
  const callback=f.previewRunner.mock.calls[0][0].recordChild;
  await expect(callback({branchId:'br-kept'})).resolves.toBe(true);
  expect(f.saveKeptChild).toHaveBeenCalledTimes(1);
 });
 it('preserves pending audit on unknown provider, failed deletion, missing keep or changed input',async()=>{
  for(const flags of [{pending:true},{badDelete:true},{badKeep:true},
   {previewThrow:true},{drift:true}]){
   const f=fixture(flags);
   const args={...input,keep:flags.badKeep===true};
   const out=result(await f.call({...args,confirm:true}));
   expect(out.done,JSON.stringify({flags,out})).toBe(false);
   expect(out.confirmed).toBe('pending');
   expect(result(await f.call({...args,confirm:true})).confirmed).toBe('pending');
   expect(f.previewRunner).toHaveBeenCalledTimes(flags.drift?0:1);
  }
 });
 it('refuses expired/unowned/foreign-app and protected resources without priced provider mutation',async()=>{
  for(const flags of [{blocked:true},{appOwned:true},{expired:true},{unowned:true}]){
   const f=fixture(flags),out=result(await f.call({...input,confirm:true}));
   expect(out.done,JSON.stringify({flags,out})).toBe(false);
   expect(f.previewRunner).not.toHaveBeenCalled();
  }
  const nonFull=fixture();
  nonFull.ctx.connection.profile='read_only';
  expect(result(await nonFull.call({...input,confirm:true})).done).toBe(false);
  expect(nonFull.previewRunner).not.toHaveBeenCalled();
 });
});