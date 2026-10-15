import {describe,it,expect,vi} from 'vitest';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {createDevCheckpointHandlers} from '../../src/tools/dev-checkpoints.js';
import {isToolAllowed} from '../../src/core/profiles.js';

const root={projectId:'proj-dev-v3',branchId:'br-dev-v3',runId:'run-owned-v3',
 endpointId:'ep-dev-v3',databaseName:'devdb',roleName:'devrole'};
const cp={...root,name:'beforeMigration'};
const reset={...root};
const restore={...root,checkpointName:cp.name};
function fixture({blocked=false,appOwned=false,expired=false,protectedBranch=false,
 unowned=false,badWal=false,persist=false,missingHistory=false,drift=false,
 badBackup=false}={}){
 const f=makeContractFixture({blocked,appOwned});
 const expiry=new Date(Date.now()+86400000).toISOString();
 f.ctx.connection={neonOrg:'org-v3',projectScope:root.projectId,
  profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:root.branchId,project_id:root.projectId,
  parent_id:'br-parent',expires_at:expired?'2020-01-01T00:00:00Z':expiry,
  protected:protectedBranch,default:false});
 f.ctx.db.getDevRun=async()=>unowned?null:{id:root.runId,status:'active'};
 f.ctx.db.listDevRunObjects=async()=>unowned?[]:[{
  run_id:root.runId,object_type:'branch',object_id:root.branchId,
  cleaned:false,expires_at:expiry,parent_id:'br-parent'
 }];
 const stored=new Map();
 if(persist)stored.set(cp.name,{id:'cp_'+'1'.repeat(40),
  name:cp.name,lsn:'1/ABCDEF',created_at:new Date(Date.now()-120000).toISOString()});
 f.ctx.db.saveDevCheckpoint=vi.fn(async data=>{
  if(stored.has(data.name))return null;
  const row={id:data.id,name:data.name,lsn:data.lsn,
   created_at:new Date().toISOString()};
  stored.set(data.name,row);return row;
 });
 f.ctx.db.getDevCheckpoint=vi.fn(async({name})=>
  missingHistory?null:structuredClone(stored.get(name)??null));
 const provider=vi.fn(async()=>({content:[{text:JSON.stringify({
  done:true,confirmed:true
 })}]}));
 let providerCalls=0;
 const delegates={
  neon_branch_restore:async(a)=>{providerCalls++;return provider(a);},
  neon_branch_reset_from_parent:async(a)=>{providerCalls++;return provider(a);}
 };
 const recordBackup=vi.fn(async()=>!badBackup);
 let checks=0;
 const built=createDevCheckpointHandlers({contextFor:async()=>f.ctx,
  verifyTarget:async()=>({pid:root.projectId,bid:root.branchId,
   endpointId:root.endpointId,database:root.databaseName,
   role:root.roleName,endpoint:{host:'dev.fake.test'}}),
  readWal:async()=>badWal?'not-lsn':'1/ABCDEF',
  delegate:delegates,
  postRestore:recordBackup,
  inventoryFor:async()=>{
   checks++;
   return {client:{},branches:[
    {id:root.branchId,name:'dev-run',project_id:root.projectId},
    {id:'br-parent',name:'parent',project_id:root.projectId}
   ]};
  },
  checkRetention:async()=>drift&&checks>1?2400:3600
 });
 return {...f,...built,stored,recordBackup,provider,get providerCalls(){return providerCalls;},
  call:(name,args)=>built.handlers[name](args,{})};
}
const content=r=>JSON.parse(r.content[0].text);
describe('V-3 run-owned checkpoint/restore/reset workflow',()=>{
 it('registers audited full-owner-only write tools and never opens read-only dispatch',()=>{
  const f=fixture();
  expect(f.tools.map(t=>t.name)).toEqual([
   'neon_dev_checkpoint','neon_dev_reset_branch','neon_dev_restore_checkpoint'
  ]);
  for(const tool of f.tools){
   expect(tool).toMatchObject({writes:true,writeContract:'defineWrite-v1',
    productionEffect:'none',profiles:['full']});
   expect(tool.inputSchema.additionalProperties).toBe(false);
   expect(isToolAllowed(tool,{profile:'read_only'},{productionDeployment:true})).toBe(false);
  }
  expect(f.tools[1].destructive).toBe(true);
  expect(f.tools[2].destructive).toBe(true);
 });
 it('captures one verified WAL LSN in durable run scope only after confirmation and replays no write',async()=>{
  const f=fixture();
  const preview=content(await f.call('neon_dev_checkpoint',{...cp,dryRun:true}));
  expect(preview).toMatchObject({done:false,needsConfirmation:true});
  expect(f.ctx.db.saveDevCheckpoint).not.toHaveBeenCalled();
  expect(content(await f.call('neon_dev_checkpoint',cp)).code).toBe('needs_confirmation');
  const done=content(await f.call('neon_dev_checkpoint',{...cp,confirm:true}));
  expect(done).toMatchObject({done:true,confirmed:true});
  expect(f.ctx.db.saveDevCheckpoint).toHaveBeenCalledTimes(1);
  expect(f.stored.get(cp.name).lsn).toBe('1/ABCDEF');
  expect(content(await f.call('neon_dev_checkpoint',{...cp,confirm:true})))
   .toMatchObject({done:true,confirmed:true});
  expect(f.ctx.db.saveDevCheckpoint).toHaveBeenCalledTimes(1);
 });
 it('refuses an unusable WAL position and preserves a pending audit rather than inventing success',async()=>{
  const f=fixture({badWal:true});
  const result=content(await f.call('neon_dev_checkpoint',{...cp,confirm:true}));
  expect(result).toMatchObject({done:false,confirmed:'pending'});
  expect(f.ctx.db.saveDevCheckpoint).not.toHaveBeenCalled();
 });
 it('routes reset to the audited parent-reset with a unique stable preservation name',async()=>{
  const f=fixture();
  const preview=content(await f.call('neon_dev_reset_branch',{...reset,dryRun:true}));
  expect(preview.needsConfirmation).toBe(true);
  expect(f.providerCalls).toBe(0);
  const actual=content(await f.call('neon_dev_reset_branch',{...reset,confirm:true}));
  expect(actual).toMatchObject({done:true,confirmed:true});
  expect(f.providerCalls).toBe(1);
  const mapped=f.provider.mock.calls[0][0];
  expect(mapped).toMatchObject({branchId:root.branchId,confirm:true});
  expect(mapped.sourceLsn).toBeUndefined();
  expect(mapped.preserveName).toMatch(/^dev-preserve-[0-9a-f]{24}$/);
  expect(f.recordBackup).toHaveBeenCalledTimes(1);
  expect(f.recordBackup.mock.calls[0][3]).toMatch(/^rmcp_/);
  expect(content(await f.call('neon_dev_reset_branch',{...reset,confirm:true})).done).toBe(true);
  expect(f.providerCalls).toBe(1);
 });
 it('restores only a stored LSN from its OWN branch and requires a preservation record',async()=>{
  const f=fixture({persist:true});
  const result=content(await f.call('neon_dev_restore_checkpoint',{...restore,confirm:true}));
  expect(result).toMatchObject({done:true,confirmed:true});
  expect(f.provider).toHaveBeenCalledTimes(1);
  const mapped=f.provider.mock.calls[0][0];
  expect(mapped).toMatchObject({sourceBranchId:root.branchId,
   branchId:root.branchId,sourceLsn:'1/ABCDEF',confirm:true});
  const failed=fixture({persist:true,badBackup:true});
  const out=content(await failed.call('neon_dev_restore_checkpoint',{...restore,confirm:true}));
  expect(out).toMatchObject({done:false,confirmed:'pending'});
  expect(failed.providerCalls).toBe(1);
  expect(content(await failed.call('neon_dev_restore_checkpoint',{...restore,confirm:true}))
   .confirmed).toBe('pending');
  expect(failed.providerCalls).toBe(1);
 });
 it('refuses missing/stale migration history, altered policy and fake owner inputs before restore',async()=>{
  const unknown=fixture();
  expect(content(await unknown.call('neon_dev_restore_checkpoint',
   {...restore,confirm:true})).done).toBe(false);
  expect(unknown.providerCalls).toBe(0);
  const drifted=fixture({persist:true,drift:true});
  const drift=content(await drifted.call('neon_dev_restore_checkpoint',
   {...restore,confirm:true}));
  expect(drift.done).toBe(false);
  expect(drifted.providerCalls).toBe(0);
  for(const flags of [{blocked:true},{appOwned:true},{unowned:true},
    {expired:true},{protectedBranch:true}]){
   const f=fixture({...flags,persist:true});
   for(const [name,input] of [['neon_dev_checkpoint',cp],
    ['neon_dev_reset_branch',reset],['neon_dev_restore_checkpoint',restore]]){
    const out=content(await f.call(name,{...input,confirm:true}));
    expect(out.done,JSON.stringify({flags,name,out})).toBe(false);
   }
   expect(f.providerCalls).toBe(0);
  }
 });
});