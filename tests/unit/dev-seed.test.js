import {describe,it,expect,vi} from 'vitest';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {compileDemoSeed} from '../../src/dev/seed-plan.js';
import {createDemoSeedHandlers} from '../../src/tools/dev-seed.js';
import {isToolAllowed} from '../../src/core/profiles.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';

const input={projectId:'proj-fake-seed',branchId:'br-fake-seed',runId:'run-owned',
 endpointId:'ep-fake-seed',databaseName:'devdb',roleName:'devrole',
 scenario:'rental',seed:'repeat',rowsPerTable:3};
function fixture({blocked=false,appOwned=false,protectedBranch=false,
 expired=false,unowned=false,badRows=false}={}){
 const f=makeContractFixture({blocked,appOwned});
 f.ctx.connection={neonOrg:'org-fake',projectScope:input.projectId,
  profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:input.branchId,project_id:input.projectId,
  protected:protectedBranch,default:false,
  expires_at:expired?'2020-01-01T00:00:00Z':expiry});
 const expiry=new Date(Date.now()+24*3600000).toISOString();
 f.ctx.db.getDevRun=async()=>unowned?null:{id:input.runId,status:'active'};
 f.ctx.db.listDevRunObjects=async()=>unowned?[]:[{
  run_id:input.runId,object_type:'branch',object_id:input.branchId,cleaned:false,
  expires_at:expiry,parent_id:'br-fake-parent'}];
 const plan=compileDemoSeed({...input,requestKey:f.ctx.writeKey('neon_dev_seed',input)});
 let invokes=0;
 const runner=vi.fn(async opt=>{
  invokes++;
  expect(opt.target).toMatchObject({projectId:input.projectId,
   branchId:input.branchId,database:input.databaseName,role:input.roleName});
  expect(opt.statements).toHaveLength(11);
  expect(opt.expectedAffectedRows).toEqual([0,0,0,0,0,0,3,3,3,3,3]);
  expect(opt.requestKey).toMatch(/^rmcp_devseed_/);
  const verified=await opt.verifyReadBack();
  return verified?{done:true,confirmed:true}:{done:false,confirmed:'pending'};
 });
 const sqlFactory=()=>async(_scope,_target,callback)=>callback({
  query:async text=>{
   const table=plan.tables.find(t=>text.includes('."'+t.name+'" ORDER BY'));
   if(!table)throw Error('Unexpected internal seed readback query');
   const rows=structuredClone(table.rows);
   if(badRows)rows[0].id=999;
   return {rows};
  }
 });
 const verifyTarget=async()=>({
  pid:input.projectId,bid:input.branchId,endpointId:input.endpointId,
  database:input.databaseName,role:input.roleName,endpoint:{host:'fake.neon.test'}
 });
 const built=createDemoSeedHandlers({contextFor:async()=>f.ctx,
  runner,sqlFactory,verifyTarget,
  admissionsFor:()=>({sqlSpendAdmission:async()=>true})});
 return {...f,...built,runner,get invokes(){return invokes;},
  seedPlan:plan,call:a=>built.handlers.neon_dev_seed(a,{})};
}
describe('V-2 end-to-end guarded developer demo seed',()=>{
 it('registers a full-owner-only audited write in the standard tool doors',()=>{
  const f=fixture(),t=f.tools[0];
  expect(t).toMatchObject({name:'neon_dev_seed',writes:true,
   writeContract:'defineWrite-v1',productionEffect:'none',profiles:['full']});
  expect(t.inputSchema.additionalProperties).toBe(false);
  expect(isToolAllowed(t,{profile:'full'},{productionDeployment:true})).toBe(true);
  expect(isToolAllowed(t,{profile:'read_only'},{productionDeployment:true})).toBe(false);
  expect(isToolAllowed(t,{profile:'full'},{productionDeployment:false})).toBe(false);
 });
 it('previews only, confirms exactly one guarded SQL transaction and replays nothing',async()=>{
  const f=fixture();
  const preview=f.parse(await f.call({...input,dryRun:true}));
  expect(preview).toMatchObject({done:false,needsConfirmation:true});
  expect(preview.preview).toContain('15 fabricated rental rows');
  expect(f.invokes).toBe(0);
  const missing=f.parse(await f.call(input));
  expect(missing.code).toBe('needs_confirmation');
  expect(f.invokes).toBe(0);
  const once=f.parse(await f.call({...input,confirm:true}));
  expect(once).toMatchObject({done:true,confirmed:true});
  expect(f.invokes).toBe(1);
  const again=f.parse(await f.call({...input,confirm:true}));
  expect(again).toMatchObject({done:true,confirmed:true});
  expect(f.invokes).toBe(1);
  expect(f.log.find(x=>x.kind==='reserved')).toMatchObject({
   tool:'neon_dev_seed',confirmed:'true',projectId:input.projectId,branchId:input.branchId});
 });
 it('refuses protected, app-owned, unowned, expired, profile-limited and malformed targets before SQL',async()=>{
  for(const flags of [{blocked:true},{appOwned:true},{unowned:true},
   {expired:true},{protectedBranch:true}]){
   const f=fixture(flags);
   const result=f.parse(await f.call({...input,confirm:true}));
   expect(result.done,JSON.stringify({flags,result})).toBe(false);
   expect(f.invokes).toBe(0);
  }
  const full=fixture();
  full.ctx.connection.profile='read_only';
  expect(full.parse(await full.call({...input,confirm:true})).done).toBe(false);
  expect(full.invokes).toBe(0);
  const invalid=fixture();
  expect(invalid.parse(await invalid.call({...input,rowsPerTable:101,confirm:true})).done).toBe(false);
  expect(invalid.invokes).toBe(0);
 });
 it('leaves an uncertain readback pending without claiming success or retrying',async()=>{
  const f=fixture({badRows:true});
  const out=f.parse(await f.call({...input,confirm:true}));
  expect(out.confirmed).toBe('pending');
  expect(f.invokes).toBe(1);
  const repeated=f.parse(await f.call({...input,confirm:true}));
  expect(repeated.confirmed).toBe('pending');
  expect(f.invokes).toBe(1);
 });
 it('never exposes a write through the read-only dispatch door',async()=>{
  const f=fixture(),registry={tools:f.tools,handlers:f.handlers};
  const out=await dispatchReadOnlyTool({registry,name:'neon_dev_seed',
   args:{...input,confirm:true},
   connection:{...f.ctx.connection,profile:'read_only'},
   db:f.ctx.db,env:{VERCEL_ENV:'production'}});
  expect(out.isError).toBe(true);
  expect(f.invokes).toBe(0);
 });
});
