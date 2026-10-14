import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {createDemoSeedHandlers} from '../../src/tools/dev-seed.js';
import {compilePublicImport} from '../../src/dev/import-plan.js';

const args={projectId:'proj-import',branchId:'br-import',runId:'run-import',
 endpointId:'ep-import',databaseName:'scratch',roleName:'builder',
 sourceUrl:'https://raw.githubusercontent.com/public-project/fixtures/main/demo.json'};
const content=JSON.stringify([
 {sku:'DEMO-1',price_cents:1000,email:'one@example.com'},
 {sku:'DEMO-2',price_cents:1200,email:'two@example.com'}
]);
function source(text=content){
 return {text,host:'raw.githubusercontent.com',kind:'json',
  sha256:createHash('sha256').update(text).digest('hex'),
  byteLength:Buffer.byteLength(text)};
}
function fixture({blocked=false,expired=false,badRows=false,changed=false}={}){
 const f=makeContractFixture({blocked});
 const expiry=new Date(Date.now()+86400000).toISOString();
 f.ctx.connection={neonOrg:'org-fake',projectScope:args.projectId,
  profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:args.branchId,project_id:args.projectId,
  expires_at:expired?'2020-01-01T00:00:00Z':expiry,
  default:false,protected:false});
 f.ctx.db.getDevRun=async()=>({id:args.runId,status:'active'});
 f.ctx.db.listDevRunObjects=async()=>[{run_id:args.runId,object_id:args.branchId,
  object_type:'branch',cleaned:false,expires_at:expiry}];
 const expected=compilePublicImport({source:source(),
  requestKey:f.ctx.writeKey('neon_dev_seed',args)});
 let fetches=0;
 const fetchSource=vi.fn(async()=>{
  fetches++;
  return changed&&fetches===2?source(JSON.stringify([{sku:'REPLACED'}])):source();
 });
 const runner=vi.fn(async opt=>{
  expect(opt.requestKey).toMatch(/^rmcp_devseed_/);
  expect(opt.statements).toHaveLength(3);
  expect(opt.expectedAffectedRows).toEqual([0,0,2]);
  const okay=await opt.verifyReadBack();
  return okay?{done:true,confirmed:true}:{done:false,confirmed:'pending'};
 });
 const sqlFactory=()=>async (_auth,_target,action)=>action({query:async query=>{
  expect(query).toContain('FROM "'+expected.schema+'"."import_rows"');
  const rows=structuredClone(expected.rows);
  if(badRows)rows[0].price_cents=-1;
  return {rows};
 }});
 const built=createDemoSeedHandlers({contextFor:async()=>f.ctx,fetchSource,
  runner,sqlFactory,admissionsFor:()=>({sqlSpendAdmission:async()=>true}),
  verifyTarget:async()=>({pid:args.projectId,bid:args.branchId,
   endpointId:args.endpointId,database:args.databaseName,role:args.roleName,
   endpoint:{host:'safe.fake.test'}})});
 return {...f,...built,fetchSource,runner,
  call:a=>built.handlers.neon_dev_seed(a,{})};
}
describe('V-2 owner-confirmed public file import',()=>{
 it('shows bounded non-sensitive preview, refuses missing confirm, applies once and never replays',async()=>{
  const f=fixture();
  const dry=f.parse(await f.call({...args,dryRun:true}));
  expect(dry).toMatchObject({done:false,needsConfirmation:true});
  expect(dry.preview).toContain('2 checked rows');
  expect(dry.preview).not.toContain('/fixtures/');
  expect(f.runner).not.toHaveBeenCalled();
  const missing=f.parse(await f.call(args));
  expect(missing.code).toBe('needs_confirmation');
  expect(f.runner).not.toHaveBeenCalled();
  expect(f.parse(await f.call({...args,confirm:true})))
   .toMatchObject({done:true,confirmed:true});
  expect(f.runner).toHaveBeenCalledTimes(1);
  expect(f.parse(await f.call({...args,confirm:true}))).toMatchObject({
   done:true,confirmed:true});
  expect(f.runner).toHaveBeenCalledTimes(1);
 });
 it('refuses mixing scenario and public file, and inherited protected/expired run scope',async()=>{
  const bad=fixture();
  expect(bad.parse(await bad.call({...args,scenario:'store',confirm:true})).done)
   .toBe(false);
  expect(bad.runner).not.toHaveBeenCalled();
  const protectedRun=fixture({blocked:true});
  expect(protectedRun.parse(await protectedRun.call({...args,confirm:true})).done)
   .toBe(false);
  expect(protectedRun.runner).not.toHaveBeenCalled();
  const expiredRun=fixture({expired:true});
  expect(expiredRun.parse(await expiredRun.call({...args,confirm:true})).done)
   .toBe(false);
  expect(expiredRun.fetchSource).not.toHaveBeenCalled();
 });
 it('refuses a file changed between preflight and confirmation without sending SQL',async()=>{
  const f=fixture({changed:true});
  const out=f.parse(await f.call({...args,confirm:true}));
  expect(out).toMatchObject({done:false,confirmed:'pending'});
  expect(f.fetchSource).toHaveBeenCalledTimes(2);
  expect(f.runner).not.toHaveBeenCalled();
 });
 it('leaves a failed independent row comparison pending with no retry',async()=>{
  const f=fixture({badRows:true});
  expect(f.parse(await f.call({...args,confirm:true}))).toMatchObject({
   done:false,confirmed:'pending'});
  expect(f.runner).toHaveBeenCalledTimes(1);
  expect(f.parse(await f.call({...args,confirm:true}))).toMatchObject({
   done:false,confirmed:'pending'});
  expect(f.runner).toHaveBeenCalledTimes(1);
 });
});
