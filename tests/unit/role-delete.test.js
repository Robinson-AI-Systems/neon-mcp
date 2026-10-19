import {describe,it,expect} from 'vitest';
import {tools} from '../../src/tools/role-delete.js';
import {isToolAllowed} from '../../src/core/profiles.js';
import {fixture,a,json} from '../../test/helpers/role-retirement-fixture.js';
async function preview(f){
 const p=json(await f.invoke({...a,dryRun:true}));
 expect(p.retirementConsent).toMatch(/^[A-Za-z0-9_-]{43}$/);
 return {...a,confirm:true,confirmRoleName:a.roleName,acknowledgeConnectionInterruption:true,
  retirementConsent:p.retirementConsent};
}
describe('confirmed role retirement',()=>{
 it('uses one-use exact consent without claiming pooled-client visibility',async()=>{
  const f=fixture(),args=await preview(f);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  expect(f.log[0].summary).toMatch(/pooled clients.*UNKNOWN/);
  const outcome=json(await f.invoke(args));
  expect(outcome).toMatchObject({done:true,confirmed:true});
  expect(f.fake.calls.filter(x=>x.method==='DELETE')).toHaveLength(1);
  expect(f.previews.size).toBe(0);expect(f.inspections).toBe(3);
  f.fake.assertClean();
 });
 it('confirms a documented 204 only from independent role absence readback',async()=>{
  const f=fixture({deleteStatus:204}),args=await preview(f);
  expect(json(await f.invoke(args)).confirmed).toBe(true);f.fake.assertClean();
 });
 it('keeps confirmed=false when the provider role remains',async()=>{
  const f=fixture({afterAbsent:false}),args=await preview(f);
  expect(json(await f.invoke(args)).confirmed).toBe(false);
  expect(f.fake.calls.filter(x=>x.method==='DELETE')).toHaveLength(1);
 });
 it.each(['acknowledgeConnectionInterruption','confirmRoleName','retirementConsent'])('requires %s before deletion',async key=>{
  const f=fixture(),args=await preview(f);delete args[key];
  expect(json(await f.invoke(args)).done).toBe(false);
  expect(f.fake.calls.filter(x=>x.method==='DELETE')).toHaveLength(0);
 });
 it('rejects another connection and stale role identity before deletion',async()=>{
  for(const change of ['connection','revision','oid']){
   const f=fixture(),args=await preview(f);
   if(change==='connection')f.c.connectionId='client-other';
   if(change==='revision')f.report.roleRevision='2026-10-14T10:00:00Z';
   if(change==='oid')f.report.computes[0].roleOid=182;
   expect(json(await f.invoke(args)).done).toBe(false);
   expect(f.fake.calls.filter(x=>x.method==='DELETE')).toHaveLength(0);
  }
 });
 it.each([{sessions:2},{owned:1},{allowed:false},{production:true}])('refuses dependency and guard failures: %j',async opts=>{
  const f=fixture(opts);
  expect(json(await f.invoke({...a,dryRun:true})).retirementConsent).toBeUndefined();
  expect(f.fake.calls.filter(x=>x.method==='DELETE')).toHaveLength(0);
 });
 it('returns a fixed refusal without consent when preview persistence fails',async()=>{
  const f=fixture();f.c.db.recordRoleRetirementPreview=async()=>{throw Error('napi_FAKE_private_database_error');};
  const out=json(await f.invoke({...a,dryRun:true}));
  expect(out).toMatchObject({done:false,code:'preview_unavailable'});
  expect(out.retirementConsent).toBeUndefined();expect(JSON.stringify(out)).not.toContain('napi_');
  expect(f.fake.calls.filter(x=>x.method==='DELETE')).toHaveLength(0);
 });
 it('never exposes deletion to everyday/read-only profiles or preview deployments',()=>{
  expect(tools[0]).toMatchObject({writes:true,destructive:true,access:true});
  for(const profile of ['everyday','read_only'])
   expect(isToolAllowed(tools[0],{profile},{productionDeployment:true})).toBe(false);
  expect(isToolAllowed(tools[0],{profile:'full'},{productionDeployment:false})).toBe(false);
 });
});
