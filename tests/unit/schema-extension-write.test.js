import {describe,it,expect} from 'vitest';
import {tools,createExtensionWriteHandlers} from '../../src/tools/schema-extension-write.js';
import {EXTENSIONS_SQL} from '../../src/tools/schema-reads.js';

const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',extensionName:'hstore',update:false};
const json=x=>JSON.parse(x.content[0].text);
function fixture({initial=null,foreign=false,mode='preview',profile='full',
 protectedTarget=false,truncated=false,throwOnCommit=false}={}){
 let installed=initial;
 const events=[];
 const ctx={connection:{neonOrg:'org-fake',projectScope:args.projectId,
  mode,profile},deploymentEnv:'production',
  db:{recordWritePreview:async x=>events.push(['preview',x.tool]),
   reserveWrite:async x=>{events.push(['reserve',x.tool]);return {created:true,id:1}},
   completeWrite:async x=>events.push(['complete',x.confirmed])},
  writeKey:()=> 'rmcp_extension_safe_12345678',
  guards:{checkProtected:async()=>!protectedTarget,
   checkApp:async()=>true,
   checkProduction:async()=>({allowed:true,production:mode==='production'}),
   checkSpend:async()=>true}};
 const impl=createExtensionWriteHandlers({
  contextFor:async()=>ctx,
  verifyTarget:async a=>({pid:foreign?'proj-foreign':a.projectId,bid:a.branchId,
   endpointId:a.endpointId,database:a.databaseName,role:a.roleName,
   endpoint:{host:'direct.invalid'}}),
  query:async x=>{events.push(['catalog',x]);return {
   done:true,truncated,rowCount:1,rows:[
    {extension_name:'hstore',default_version:'1.8',
     installed_version:installed}]};},
  mutate:async x=>{events.push(['mutate',x]);
   if(throwOnCommit)throw Error('uncertain commit');
   installed='1.8';return {issued:true};}
 });
 return {ctx,events,run:impl.handlers.neon_schema_enable_extension};
}
describe('D-6 guarded, owner-approved extension install/upgrade',()=>{
 it('registers the B-1 audited destructive write and strict full-owner profile',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_schema_enable_extension',
   writes:true,destructive:true,access:true,profiles:['full'],
   writeContract:'defineWrite-v1'});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
  expect(tools[0].inputSchema.required).toContain('update');
 });
 it('previews without mutation and confirms only after independent catalog readback',async()=>{
  const f=fixture();
  const preview=json(await f.run({...args,dryRun:true},f.ctx));
  expect(preview.needsConfirmation).toBe(true);
  expect(f.events.some(x=>x[0]==='mutate')).toBe(false);
  const result=json(await f.run({...args,confirm:true},f.ctx));
  expect(result).toMatchObject({done:true,confirmed:true});
  expect(f.events.filter(x=>x[0]==='catalog')).toHaveLength(4);
  const event=f.events.find(x=>x[0]==='mutate')[1];
  expect(event.target).toMatchObject({projectId:args.projectId,
   branchId:args.branchId,endpointId:args.endpointId,
   expectedEndpointHost:'direct.invalid',database:'neondb',
   role:'owner',pooled:false});
  expect(f.events).toContainEqual(['complete','true']);
 });
 it('only updates a verified older extension and rejects already-current',async()=>{
  const f=fixture({initial:'1.7'});
  expect(json(await f.run({...args,update:true,confirm:true},f.ctx)))
   .toMatchObject({done:true,confirmed:true});
  const same=fixture({initial:'1.8'});
  expect(json(await same.run({...args,update:true,confirm:true},same.ctx)).done)
   .toBe(false);
  expect(same.events.some(x=>x[0]==='mutate')).toBe(false);
 });
 it('keeps ambiguous SQL state pending, with no blind automatic retry',async()=>{
  const f=fixture({throwOnCommit:true});
  expect(json(await f.run({...args,confirm:true},f.ctx)))
   .toMatchObject({done:false,confirmed:'pending'});
  expect(f.events.filter(x=>x[0]==='mutate')).toHaveLength(1);
 });
 it('refuses foreign identity, protected, production, wrong profile and partial metadata',async()=>{
  for(const option of [{foreign:true},{protectedTarget:true},
   {mode:'production'},{profile:'read_only'},{truncated:true}]){
   const f=fixture(option);
   expect(json(await f.run({...args,confirm:true},f.ctx)).done).toBe(false);
   expect(f.events.some(x=>x[0]==='mutate')).toBe(false);
  }
  const f=fixture();
  expect(json(await f.run({...args,extensionName:'plpython3u',
   confirm:true},f.ctx)).done).toBe(false);
  expect(f.events.some(x=>x[0]==='mutate')).toBe(false);
 });
 it('never reads table rows or interpolates caller SQL for catalog inspection',async()=>{
  const f=fixture();
  await f.run({...args,dryRun:true},f.ctx);
  const first=f.events.find(x=>x[0]==='catalog')[1];
  expect(first.text).toBe(EXTENSIONS_SQL);
  expect(first.target.pooled).toBe(false);
  expect(first.text).not.toMatch(/SELECT\s+\*/);
 });
});
