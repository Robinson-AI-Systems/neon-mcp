import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {createVerifiedComputeConnectionCount} from '../../src/neon/compute-connections.js';
import {IDS,project,devEndpoint,devBranch,database,role} from '../../test/helpers/neon-fixtures.js';
function scenario({pooled=false,wrongProject=false,privilege=true,count='4',
 protectedItem=false,production=false,productionReads=true}={}){
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
   calls.push({query:text});
   if(text.startsWith('SELECT CASE WHEN pg_has_role'))
    return {rows:[{total:privilege?count:null}]};
   if(['BEGIN READ ONLY','COMMIT','ROLLBACK',
       'SET LOCAL statement_timeout = 15000','SET LOCAL lock_timeout = 5000'].includes(text))
    return {rows:[]};
   throw Error('Unapproved monitoring query');
  }});
 };
 const connection={neonOrg:IDS.org,projectScope:IDS.project,mode:'production'};
 const db={getProtectedResources:async()=>protectedItem?[{
   kind:'other',org:IDS.org,project_id:IDS.project,label:'Owner protected'
  }]:[],getSqlReadPolicy:async()=>({productionReads,maxRows:200})};
 const authorizationContext={connection,db,
  selfProject:{org:IDS.org,project_id:'proj-fake-self'},
  getBranch:async()=>({id:IDS.dev,default:production,protected:false})};
 const reader=createVerifiedComputeConnectionCount({connection,db,
  clientFor:async()=>client,sqlLayer,authorizationContext});
 return {fake,calls,reader};
}
const ids={projectId:IDS.project,branchId:IDS.dev,endpointId:IDS.devEndpoint};
describe('D-3 independently bound protected compute connection counts',()=>{
 it('reads complete unpooled PostgreSQL sessions from exact verified endpoint and role',async()=>{
  const {fake,calls,reader}=scenario();
  expect(await reader(ids)).toBe(4);
  expect(calls.filter(x=>x.options)).toHaveLength(1);
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
   await expect(reader(ids)).rejects.toThrow(/count/);
   fake.assertClean();
  }
 });
 it('never opens SQL for owner-protected projects or disabled production reads',async()=>{
  for(const flags of [{protectedItem:true},{production:true,productionReads:false}]){
   const {fake,calls,reader}=scenario(flags);
   await expect(reader(ids)).rejects.toThrow(/authorized|count/);
   expect(calls).toHaveLength(0);
   expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
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
