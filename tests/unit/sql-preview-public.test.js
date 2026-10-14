import {describe,it,expect} from 'vitest';
import {createSqlPreviewHandlers} from '../../src/tools/sql-preview.js';
const target={projectId:'proj-fake-target',branchId:'br-fake-child',
 endpointId:'ep-fake-child',databaseName:'neondb',roleName:'owner'};
const args={...target,statements:['UPDATE invoices SET paid=true WHERE id=$1'],
 params:[[7]]};
function fixture({allowed=true,profile='full',production=true,createResult=null,drift=false}={}){
 const actions=[],t={pid:target.projectId,bid:target.branchId,
  endpointId:target.endpointId,database:target.databaseName,role:target.roleName,
  endpoint:{host:drift?'moved.neon.tech':'fixed.neon.tech'}};
 const ctx={connection:{neonOrg:'org-fake-test',projectScope:target.projectId,
  profile,mode:production?'production':'preview'},
  clientFor:async()=>({provider:'fake'}),
  db:{recordWritePreview:async x=>actions.push({type:'preview',...x}),
   reserveWrite:async x=>{actions.push({type:'reserve',...x});return {created:true,id:10}},
   completeWrite:async x=>actions.push({type:'complete',...x})},
  writeKey:()=> 'rmcp_sql_preview_fixture_1234',
  reserveSpendWrite:async()=>({created:true,id:10}),
  guards:{checkProtected:async()=>allowed,
   checkProduction:async()=>({allowed:allowed&&production,production}),
   checkApp:async()=>allowed,
   checkSpend:async()=>allowed}};
 const createPreview=async opts=>{
  actions.push({type:'createPreview',opts});return createResult??
  {done:true,exact:true,childDeleted:true,affectedRows:[1],
   schemaChanged:false,previewToken:'a'.repeat(43),validForMinutes:30}};
 const implementation=createSqlPreviewHandlers({
  contextFor:async()=>ctx,verifyTarget:async()=>t,createPreview,
  sqlFactory:()=>()=>{}});
 return {...implementation,handler:implementation.handlers.neon_sql_preview_change,ctx,actions};
}
const json=resp=>JSON.parse(resp.content[0].text);
describe('D-5 guarded isolated exact SQL preview',()=>{
 it('advertises full owner, spend and destructive write contract',()=>{
  const f=fixture(),tool=f.tools[0];
  expect(tool).toMatchObject({name:'neon_sql_preview_change',writes:true,
   writeContract:'defineWrite-v1',profiles:['full'],destructive:true,access:true,spend:true});
  expect(tool.inputSchema.additionalProperties).toBe(false);
 });
 it('previews without creating a branch or exposing a token',async()=>{
  const f=fixture();
  const result=json(await f.handler({...args,dryRun:true},f.ctx));
  expect(result.needsConfirmation).toBe(true);
  expect(result.spendMonthCents).toBe(1);
  expect(f.actions.some(x=>x.type==='createPreview')).toBe(false);
  expect(JSON.stringify(result)).not.toContain('previewToken');
 });
 it('requires separate confirm and returns a token only after verified isolated cleanup',async()=>{
  const f=fixture(),notYet=json(await f.handler(args,f.ctx));
  expect(notYet.code).toBe('needs_confirmation');
  expect(f.actions.some(x=>x.type==='createPreview')).toBe(false);
  const confirmed=json(await f.handler({...args,confirm:true},f.ctx));
  expect(confirmed).toMatchObject({done:true,confirmed:true,exact:true,
   childDeleted:true,affectedRows:[1]});
  expect(confirmed.previewToken).toHaveLength(43);
  const called=f.actions.find(x=>x.type==='createPreview').opts;
  expect(called.ctx.previewAdmission).toBeTypeOf('function');
  expect(called.params).toEqual([[7]]);
  expect(called.target).toMatchObject({pooled:false,
   expectedEndpointHost:'fixed.neon.tech'});
  expect(f.actions.some(x=>x.type==='complete'&&x.confirmed==='true')).toBe(true);
 });
 it('returns pending or false with no token if child cleanup or SQL preview fails',async()=>{
  for(const result of [{done:false,code:'preview_cleanup_pending'},
   {done:true,exact:true,childDeleted:false,previewToken:'a'.repeat(43)}]){
   const f=fixture({createResult:result});
   const x=json(await f.handler({...args,confirm:true},f.ctx));
   expect(x.done).toBe(false);
   expect(x.previewToken).toBeUndefined();
  }
 });
 it('refuses invalid SQL, full-table changes, foreign project and read SQL before spending',async()=>{
  for(const changed of [
   {...args,statements:['SELECT 1'],params:[[]]},
   {...args,statements:['DELETE FROM invoices'],params:[[]]},
   {...args,projectId:'proj-fake-foreign'},
   {...args,statements:['CALL mutate()'],params:[[]]},
   {...args,statements:['UPDATE invoices SET paid=TRUE; DROP TABLE invoices'],params:[[]]}
  ]){
   const f=fixture();
   expect(json(await f.handler({...changed,confirm:true},f.ctx)).done).toBe(false);
   expect(f.actions.some(x=>x.type==='createPreview')).toBe(false);
  }
 });
 it('honors owner, app, protected and production approval gates before write',async()=>{
  for(const options of [{profile:'everyday'},{allowed:false},{production:false}]){
   const f=fixture(options);
   const x=json(await f.handler({...args,confirm:true},f.ctx));
   expect(x.done).toBe(false);
   expect(f.actions.some(y=>y.type==='createPreview')).toBe(false);
  }
 });
});
