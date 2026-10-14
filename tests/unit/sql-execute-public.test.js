import {describe,it,expect} from 'vitest';
import {createSqlExecuteHandlers} from '../../src/tools/sql-execute.js';
const target={projectId:'proj-fake-target',branchId:'br-fake-dev',
 endpointId:'ep-fake-dev',databaseName:'neondb',roleName:'owner'};
const assertion={query:'SELECT count(*)::int AS n FROM invoices WHERE paid=true',
 params:[],expectedRows:[{n:1}]};
const one={...target,statement:'UPDATE invoices SET paid=true WHERE id=$1',
 params:[7],expectedAffectedRows:[1],assertion};
const multi={...target,statements:['UPDATE invoices SET paid=true WHERE id=$1',
 'DELETE FROM invoices WHERE expired=true AND id=$1'],
 params:[[7],[8]],expectedAffectedRows:[1,1],assertion};
function fixture({owner=true,allowed=true,mode='production',
 outcome={done:true,confirmed:true,affectedRows:[1]},
 observed={done:true,rows:[{n:1}],rowCount:1,truncated:false,
 columnsCapped:false,cellsCapped:false}}={}){
 const actions=[];
 const c={connection:{neonOrg:'org-fake-test',projectScope:target.projectId,
  profile:owner?'full':'everyday',mode},
  db:{recordWritePreview:async x=>actions.push({type:'preview',...x}),
   reserveWrite:async x=>{actions.push({type:'reserve',...x});return {created:true,id:17}},
   completeWrite:async x=>actions.push({type:'complete',...x}),
   reserveSpendCapacity:async()=>true},
  clientFor:async()=>({fake:true}),
  writeKey:()=> 'rmcp_sql_execute_fixture_1234',
  guards:{checkProtected:async()=>allowed,checkProduction:async()=>
   ({allowed,production:mode==='production'}),
   checkApp:async()=>allowed,checkSpend:async()=>allowed}};
 const runner=async args=>{
  actions.push({type:'runner',args});
  if(outcome.done===true){
   const ok=await args.verifyReadBack();
   return ok?outcome:{done:false,confirmed:'pending',code:'apply_uncertain'};
  }
  return outcome;
 };
 const verifyTarget=async a=>({pid:target.projectId,bid:target.branchId,
  endpointId:target.endpointId,database:target.databaseName,role:target.roleName,
  endpoint:{host:'fixed.neon.tech'}});
 const impl=createSqlExecuteHandlers({contextFor:async()=>c,verifyTarget,
  runner,queryRunner:async()=>observed,sqlFactory:()=>()=>{}});
 return {c,actions,impl,execute:impl.handlers.neon_sql_execute,
  transaction:impl.handlers.neon_sql_execute_transaction};
}
const json=r=>JSON.parse(r.content[0].text);
describe('D-5 SQL write entrypoints and exact independent postcondition',()=>{
 it('registers two owner-only B-1 destructive/audited writes',()=>{
  const f=fixture();
  expect(f.impl.tools.map(t=>t.name)).toEqual(['neon_sql_execute','neon_sql_execute_transaction']);
  for(const t of f.impl.tools){
   expect(t).toMatchObject({writes:true,destructive:true,access:true,
    profiles:['full'],writeContract:'defineWrite-v1'});
   expect(t.inputSchema.additionalProperties).toBe(false);
  }
 });
 it('requires preview+confirmation without invoking SQL or revealing statements',async()=>{
  const f=fixture(),x=json(await f.execute({...one,dryRun:true},f.c));
  expect(x.needsConfirmation).toBe(true);
  expect(x.preview).not.toContain('UPDATE invoices');
  expect(f.actions.some(a=>a.type==='runner')).toBe(false);
  const p=json(await f.execute(one,f.c));
  expect(p.code).toBe('needs_confirmation');
  expect(f.actions.some(a=>a.type==='runner')).toBe(false);
 });
 it('executes one statement after B-1 admission with exact target and readback',async()=>{
  const f=fixture(),result=json(await f.execute({...one,confirm:true},f.c));
  expect(result).toMatchObject({done:true,confirmed:true});
  const opts=f.actions.find(a=>a.type==='runner').args;
  expect(opts.target).toMatchObject({projectId:target.projectId,
   endpointId:target.endpointId,expectedEndpointHost:'fixed.neon.tech',pooled:false});
  expect(opts.expectedAffectedRows).toEqual([1]);
  expect(opts.requestKey).toMatch(/^rmcp_sql_inner_[a-f0-9]{48}$/);
  expect(opts.params).toEqual([[7]]);
  expect(f.actions.some(a=>a.type==='complete'&&a.confirmed==='true')).toBe(true);
 });
 it('executes ordered two-statement atomic batch with same private B-3 runner',async()=>{
  const f=fixture(),result=json(await f.transaction({...multi,confirm:true},f.c));
  expect(result.confirmed).toBe(true);
  expect(f.actions.find(a=>a.type==='runner').args.statements).toHaveLength(2);
  expect(f.actions.find(a=>a.type==='runner').args.expectedAffectedRows).toEqual([1,1]);
 });
 it('does not confirm when independent readback disagrees or is truncated',async()=>{
  for(const observed of [
   {done:true,rows:[{n:0}],rowCount:1,truncated:false},
   {done:true,rows:[{n:1}],rowCount:1,truncated:true},
   {done:false,code:'production_reads_disabled'}
  ]){
   const f=fixture({observed}),x=json(await f.execute({...one,confirm:true},f.c));
   expect(x.done).toBe(false);
   expect(x.confirmed).toBe('pending');
  }
 });
 it('rejects dangerous SQL/unknown affected rows/bad assertions before runner',async()=>{
  for(const a of [
   {...one,statement:'CALL mutate()'},
   {...one,statement:'SELECT 1'},
   {...one,statement:'DELETE FROM invoices'},
   {...one,expectedAffectedRows:[]},
   {...one,assertion:{...assertion,query:'DELETE FROM invoices',expectedRows:[{n:1}]}},
   {...one,assertion:{...assertion,expectedRows:[{n:'x'.repeat(200)}]}},
   {...one,projectId:'proj-fake-foreign'}
  ]){
   const f=fixture();
   expect(json(await f.execute({...a,confirm:true},f.c)).done).toBe(false);
   expect(f.actions.some(x=>x.type==='runner')).toBe(false);
  }
 });
 it('blocks missing full owner and protected/app/production admission before SQL',async()=>{
  for(const opts of [{owner:false},{allowed:false}]){
   const f=fixture(opts),x=json(await f.execute({...one,confirm:true},f.c));
   expect(x.done).toBe(false);
   expect(f.actions.some(a=>a.type==='runner')).toBe(false);
  }
 });
 it('passes exact preview tokens only to B-3 and preserves uncertain inner results',async()=>{
  const f=fixture({outcome:{done:false,confirmed:'pending',code:'apply_uncertain'}});
  const x=json(await f.execute({...one,confirm:true,
   previewToken:'a'.repeat(43)},f.c));
  expect(x).toMatchObject({done:false,confirmed:'pending'});
  expect(f.actions.find(a=>a.type==='runner').args.previewToken).toHaveLength(43);
 });
});
