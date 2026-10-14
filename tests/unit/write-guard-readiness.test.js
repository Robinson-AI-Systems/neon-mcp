import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch} from '../../test/helpers/neon-fixtures.js';
import {tools,createWriteGuardReadinessHandlers} from '../../src/tools/write-guard-readiness.js';

function fixture({allowApp=false,allowProtected=true,scope=IDS.project,
 profile='full',wrongOrg=false}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_READINESS',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true};}}});
 fake.when('getProject').resolves({project:project({org_id:wrongOrg?'org-foreign':IDS.org})});
 const guards={
  checkProtected:async()=>allowProtected,
  checkApp:async(_target,_ctx,args)=>allowApp&&args.outsideApp!==true,
  checkProduction:async(_target,_ctx,tool)=>({
   allowed:tool.productionEffect==='none',production:tool.productionEffect!=='none'})
 };
 const ctx={connection:{neonOrg:IDS.org,projectScope:scope,profile,mode:'preview'},
  clientFor:async p=>{expect(p).toBe(IDS.project);return client;},
  getBranch:async({projectId,branchId})=>{
   expect(projectId).toBe(IDS.project);
   return branchId===IDS.main?mainBranch():null;
  },guards};
 const handler=createWriteGuardReadinessHandlers({contextFor:async()=>ctx})
  .neon_write_guard_readiness;
 return {fake,handler};
}
const args={projectId:IDS.project,branchId:IDS.main};
const parse=r=>JSON.parse(r.content[0].text);
describe('owner-only B-1 guard readiness evidence',()=>{
 it('registers a read-only full-owner tool with exact schema',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({writes:false,profiles:['full']});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('reports missing app evidence without authorizing anything',async()=>{
  const f=fixture();
  const out=parse(await f.handler(args,{}));
  expect(out).toMatchObject({identity:'provider_verified',
   branchProduction:true,appOwnershipGate:'app_owned_or_evidence_unavailable',
   childOnlyProductionGate:'allowed',
   directMutationProductionGate:'refused_or_unavailable',
   readyForMutation:false});
  expect(f.fake.calls.map(c=>c.method)).toEqual(['GET']);
  f.fake.assertClean();
 });
 it('separates trusted app and protected refusals, never grants a write',async()=>{
  const f=fixture({allowApp:true,allowProtected:false});
  const out=parse(await f.handler(args,{}));
  expect(out.appOwnershipGate).toBe('verified_permitted');
  expect(out.protectedGate).toBe('refused_or_unavailable');
  expect(out.readyForMutation).toBe(false);
  f.fake.assertClean();
 });
 it('denies cross-scope and read-only identities before provider calls',async()=>{
  for(const options of [{scope:'project-other'},{profile:'read_only'}]){
   const f=fixture(options);
   await expect(f.handler(args,{})).rejects.toThrow();
   expect(f.fake.calls).toHaveLength(0);
  }
 });
 it('refuses a mismatched provider organization and a missing branch',async()=>{
  const f=fixture({wrongOrg:true});
  await expect(f.handler(args,{})).rejects.toThrow();
  expect(f.fake.calls.map(c=>c.method)).toEqual(['GET']);
  f.fake.assertClean();
  const missing=fixture();
  await expect(missing.handler({...args,branchId:'br-missing'},{})).rejects.toThrow();
  missing.fake.assertClean();
 });
});
