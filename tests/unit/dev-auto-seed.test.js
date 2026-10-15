import {describe,it,expect,vi} from 'vitest';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {compileAutoSeed,AUTO_TABLES_SQL,AUTO_COLUMNS_SQL,
 AUTO_CONSTRAINTS_SQL,AUTO_UNSAFE_SQL} from '../../src/dev/auto-plan.js';
import {createDemoSeedHandlers} from '../../src/tools/dev-seed.js';

const input={projectId:'proj-autoseed',branchId:'br-autoseed',runId:'run-autoseed',
 endpointId:'ep-autoseed',databaseName:'devdb',roleName:'devowner',
 scenario:'auto',existingSchema:'auto_fixture',rowsPerTable:2};
function catalog(){
 return async(text)=>{
  if(text===AUTO_TABLES_SQL)return [{table_name:'customers',relation_oid:'321'}];
  if(text===AUTO_COLUMNS_SQL)return [
   {table_name:'customers',column_name:'id',data_type:'int4',required:true,
    generated:'',identity:'',type_modifier:-1},
   {table_name:'customers',column_name:'email',data_type:'text',required:true,
    generated:'',identity:'',type_modifier:-1}
  ];
  if(text===AUTO_CONSTRAINTS_SQL)return [
   {table_name:'customers',kind:'p',columns_json:'["id"]',references_json:'[]',
    definition:'PRIMARY KEY (id)'},
   {table_name:'customers',kind:'u',columns_json:'["email"]',references_json:'[]',
    definition:'UNIQUE (email)'}
  ];
  if(text===AUTO_UNSAFE_SQL)return [];
  if(text.includes('jsonb_array_elements'))return [];
  throw Error('Unexpected SQL: '+text);
 };
}
async function fixture({blocked=false,appOwned=false,unowned=false,expired=false,
 drift=false,badRows=false}={}){
 const f=makeContractFixture({blocked,appOwned});
 const expiry=new Date(Date.now()+86400000).toISOString();
 f.ctx.connection={neonOrg:'org-fake',projectScope:input.projectId,
  profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:input.branchId,project_id:input.projectId,
  expires_at:expired?'2020-01-01T00:00:00Z':expiry,
  protected:false,default:false});
 f.ctx.db.getDevRun=async()=>unowned?null:{id:input.runId,status:'active'};
 f.ctx.db.listDevRunObjects=async()=>unowned?[]:[{run_id:input.runId,
  object_id:input.branchId,object_type:'branch',cleaned:false,expires_at:expiry}];
 let seen=0,activePlan=null;
 const autoPlanFor=vi.fn(async({requestKey})=>{
  const result=await compileAutoSeed({existingSchema:input.existingSchema,
   rowsPerTable:drift&&++seen===2?3:input.rowsPerTable,
   requestKey,query:catalog()});
  activePlan=result;
  return result;
 });
 const runner=vi.fn(async opt=>{
  expect(opt.statements).toHaveLength(1);
  expect(opt.expectedAffectedRows).toEqual([2]);
  const verified=await opt.verifyReadBack();
  return verified?{done:true,confirmed:true}:{done:false,confirmed:'pending'};
 });
 const sqlFactory=()=>async(_auth,_target,cb)=>cb({query:async(text)=>{
  expect(text).toContain('FROM "auto_fixture"."customers"');
  const rows=structuredClone(activePlan.tables[0].rows);
  if(badRows)rows[0].email='tampered@example.com';
  return {rows};
 }});
 const built=createDemoSeedHandlers({contextFor:async()=>f.ctx,
  runner,sqlFactory,autoPlanFor,
  admissionsFor:()=>({sqlSpendAdmission:async()=>true}),
  verifyTarget:async()=>({pid:input.projectId,bid:input.branchId,
   endpointId:input.endpointId,database:input.databaseName,role:input.roleName,
   endpoint:{host:'dev.fake.test'}})});
 return {...f,...built,runner,autoPlanFor,call:a=>built.handlers.neon_dev_seed(a,{})};
}
describe('V-2 guarded existing-schema auto mode',()=>{
 it('previews without write, confirms once, and does not replay a repeated audit key',async()=>{
  const f=await fixture();
  expect(f.tools[0].inputSchema.properties.scenario.enum).toContain('auto');
  const preview=f.parse(await f.call({...input,dryRun:true}));
  expect(preview).toMatchObject({done:false,needsConfirmation:true});
  expect(preview.preview).toContain('catalog-verified existing dev tables');
  expect(f.runner).not.toHaveBeenCalled();
  const need=f.parse(await f.call(input));
  expect(need.code).toBe('needs_confirmation');
  const done=f.parse(await f.call({...input,confirm:true}));
  expect(done).toMatchObject({done:true,confirmed:true});
  expect(f.runner).toHaveBeenCalledTimes(1);
  const replay=f.parse(await f.call({...input,confirm:true}));
  expect(replay).toMatchObject({done:true,confirmed:true});
  expect(f.runner).toHaveBeenCalledTimes(1);
 });
 it('requires exact recorded unprotected non-app dev ownership before any SQL',async()=>{
  for(const flags of [{blocked:true},{appOwned:true},{unowned:true},{expired:true}]){
   const f=await fixture(flags);
   const result=f.parse(await f.call({...input,confirm:true}));
   expect(result.done,JSON.stringify(flags)).toBe(false);
   expect(f.runner).not.toHaveBeenCalled();
  }
 });
 it('declines catalog changed after preview, without invoking SQL and without blind replay',async()=>{
  const f=await fixture({drift:true});
  const result=f.parse(await f.call({...input,confirm:true}));
  expect(result.confirmed).toBe('pending');
  expect(f.runner).not.toHaveBeenCalled();
  expect(f.parse(await f.call({...input,confirm:true})).confirmed).toBe('pending');
  expect(f.runner).not.toHaveBeenCalled();
 });
 it('does not confirm a committed seed when independent every-cell readback is wrong',async()=>{
  const f=await fixture({badRows:true});
  const result=f.parse(await f.call({...input,confirm:true}));
  expect(result.confirmed).toBe('pending');
  expect(f.runner).toHaveBeenCalledTimes(1);
 });
 it('refuses simultaneous source URL/description and never permits omitted schema',async()=>{
  const f=await fixture();
  for(const bad of [
   {...input,sourceUrl:'https://example.com/demo.json'},
   {...input,description:'a synthetic rental'},
   {...input,existingSchema:undefined}
  ]){
   expect(f.parse(await f.call({...bad,confirm:true})).done).toBe(false);
  }
  expect(f.runner).not.toHaveBeenCalled();
 });
});