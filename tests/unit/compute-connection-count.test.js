import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {createVerifiedComputeConnectionCount} from '../../src/neon/compute-connections.js';
import {IDS,project,devEndpoint,devBranch,database,role} from '../../test/helpers/neon-fixtures.js';
function scenario({pooled=false,wrongProject=false,privilege=true,count='4'}={}){
 const fake=makeFakeNeon();const calls=[];
 const client=makeNeonClient({key:'napi_FAKE_compute_sessions',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves({branch:devBranch(),annotation:{
  object:{type:'console/branch',id:IDS.dev},value:{}}});
 fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({
  ...(pooled?{pooler_enabled:true}:{}),
  ...(wrongProject?{project_id:'proj-fake-other-0002'}:{})})});
 fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.dev)]});
 fake.when('listProjectBranchRoles').resolves({roles:[role(IDS.dev)]});
 const sqlLayer=async(ctx,options,fn)=>{
  calls.push({ctx,options});
  return fn({query:async text=>{
   if(text.includes('pg_has_role'))return {rows:[{visible:privilege}]};
   if(text.includes('pg_stat_activity'))return {rows:[{total:count}]};
   throw Error('Unapproved monitoring query');
  }});
 };
 const reader=createVerifiedComputeConnectionCount({connection:{
  neonOrg:IDS.org,projectScope:IDS.project},db:{},
  clientFor:async()=>client,sqlLayer});
 return {fake,calls,reader};
}
const ids={projectId:IDS.project,branchId:IDS.dev,endpointId:IDS.devEndpoint};
describe('D-3 independently bound protected compute connection counts',()=>{
 it('reads complete unpooled PostgreSQL sessions from exact verified endpoint and role',async()=>{
  const {fake,calls,reader}=scenario();
  expect(await reader(ids)).toBe(4);
  expect(calls).toHaveLength(1);
  expect(calls[0].options).toMatchObject({
   projectId:IDS.project,branchId:IDS.dev,endpointId:IDS.devEndpoint,
   database:'neondb',role:'neondb_owner',pooled:false,
   expectedEndpointHost:devEndpoint().host});
  expect(calls[0].ctx.projectScope).toBe(IDS.project);
  fake.assertClean();
 });
 it('rejects pooler sessions that pg_stat_activity cannot completely count',async()=>{
  const {fake,calls,reader}=scenario({pooled:true});
  await expect(reader(ids)).rejects.toThrow(/unpooled/);
  expect(calls).toHaveLength(0);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('denies wrong project before opening a SQL connection',async()=>{
  const {fake,calls,reader}=scenario({wrongProject:true});
  await expect(reader(ids)).rejects.toThrow(/identity|independently verified/);
  expect(calls).toHaveLength(0);
  fake.assertClean();
 });
 it('requires full statistics privileges and exact nonnegative integer count',async()=>{
  for(const flags of [{privilege:false},{count:'-1'},{count:'1.5'},{count:null}]){
   const {fake,reader}=scenario(flags);
   await expect(reader(ids)).rejects.toThrow(/privilege|count/);
   fake.assertClean();
  }
 });
 it('rejects outside project scope before provider and SQL access',async()=>{
  const {fake,calls,reader}=scenario();
  await expect(reader({...ids,projectId:'proj-fake-other-0001'})).rejects.toThrow();
  expect(fake.calls).toHaveLength(0);
  expect(calls).toHaveLength(0);
 });
});
