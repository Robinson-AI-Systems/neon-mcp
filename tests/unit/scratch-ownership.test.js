import {describe,it,expect} from 'vitest';
import {attestIsolatedScratch,revokeIsolatedScratch,SCRATCH_PHRASE} from '../../src/core/scratch-ownership.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project} from '../../test/helpers/neon-fixtures.js';

const env={VERCEL_ENV:'production',DATABASE_URL:
 'postgresql://user:FAKE@localhost/owner',
 NEON_MCP_SELF_ORG_ID:IDS.org,NEON_MCP_SELF_PROJECT_ID:'proj-fake-self',
 NEON_MCP_SELF_ENDPOINT_HOST:'localhost'};
function fixture({protectedProject=false,badProject=false,keyKind='project'}={}){
 const fake=makeFakeNeon(),writes=[];
 const client=makeNeonClient({key:'napi_FAKE_SCRATCH_KEY',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true};}}});
 if(!badProject)fake.when('getProject').resolves({project:project()});
 else fake.when('getProject').resolves({project:project({id:'proj-foreign'})});
 const db={
  async getProtectedResources(){return protectedProject?[{kind:'other',
    org:IDS.org,project_id:IDS.project,label:'Owner protected'}]:[];},
  async saveScratchAttestation(x){writes.push(x);return true;},
  async revokeScratchAttestation(x){writes.push({revoked:true,...x});return true;}
 };
 const vault={async keyFor(){return {key:'napi_FAKE_SCRATCH_KEY',kind:keyKind};}};
 const opts={db,vault,env,orgId:IDS.org,projectId:IDS.project,phrase:SCRATCH_PHRASE,
  clientFor:async()=>client};
 return {fake,writes,opts};
}
describe('owner-only isolated scratch classification',()=>{
 it('requires an exact certified provider project and stores no key',async()=>{
  const f=fixture();
  expect(await attestIsolatedScratch(f.opts)).toEqual({projectId:IDS.project,verified:true});
  expect(f.writes).toEqual([{orgId:IDS.org,projectId:IDS.project,projectName:'fake-project'}]);
  expect(f.fake.calls.map(c=>c.method)).toEqual(['GET']);
  f.fake.assertClean();
 });
 it('denies invalid phrase, missing exact key, protected target and self target before mutation',async()=>{
  for(const update of [
   {phrase:'I_CONFIRM'}, {vault:{keyFor:async()=>({kind:'org',key:'napi_FAKE'})}},
   {projectId:'proj-fake-self'}
  ]){
   const f=fixture();
   await expect(attestIsolatedScratch({...f.opts,...update})).rejects.toThrow();
   expect(f.writes).toHaveLength(0);
  }
  const protectedOne=fixture({protectedProject:true});
  await expect(attestIsolatedScratch(protectedOne.opts)).rejects.toThrow();
  expect(protectedOne.fake.calls).toHaveLength(0);
 });
 it('refuses mismatched provider identity with no persisted permission',async()=>{
  const f=fixture({badProject:true});
  await expect(attestIsolatedScratch(f.opts)).rejects.toThrow();
  expect(f.writes).toHaveLength(0);
  f.fake.assertClean();
 });
 it('owner revocation has an exact scoped server-owned method',async()=>{
  const f=fixture();
  expect(await revokeIsolatedScratch({db:f.opts.db,orgId:IDS.org,projectId:IDS.project}))
   .toBe(true);
  expect(f.writes).toEqual([{revoked:true,orgId:IDS.org,projectId:IDS.project}]);
  await expect(revokeIsolatedScratch({db:f.opts.db,orgId:IDS.org,
   projectId:'BAD-ID'})).rejects.toThrow();
 });
});