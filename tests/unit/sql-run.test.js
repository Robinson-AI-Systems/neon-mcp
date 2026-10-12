import {describe,it,expect} from 'vitest';
import {assertRoleSqlAdmission,runFixedReviewedSql} from '../../src/neon/sql-run.js';
import {IDS} from '../../test/helpers/neon-fixtures.js';
function make({protectedTarget=false,production=false,profile='full',policy=true,app=true}={}){
 let calls=0;
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
   profile,mode:'preview'},
  selfProject:{org:IDS.org,project_id:'prj-fake-self'},
  getBranch:async()=>({id:IDS.dev,default:production,protected:production}),
  db:{getProtectedResources:async()=>protectedTarget?[{
   org:IDS.org,project_id:IDS.project,kind:'other',label:'Protected'}]:[],
   getSqlReadPolicy:async()=>policy?{productionReads:true,maxRows:50}:null},
  guards:{checkApp:async()=>app,
   checkProduction:async()=>({allowed:true,production:false})}};
 return {ctx,called:()=>calls,query:async(text,params)=>{calls++;return {rows:[],text,params}}};
}
describe('B-3 fixed role SQL runner admission and parsed whitelist',()=>{
 it('refuses profile, protected resources, production, unverified settings and app owners',async()=>{
  for(const opts of [{profile:'everyday'},{protectedTarget:true},
    {production:true},{policy:false},{app:false}]){
    const f=make(opts);
    await expect(assertRoleSqlAdmission({ctx:f.ctx,target:{
      pid:IDS.project,bid:IDS.dev},args:{}})).rejects.toThrow();
    expect(f.called()).toBe(0);
  }
 });
 it('admits independently verified owner-only nonproduction fixed grants',async()=>{
  const f=make();
  await expect(assertRoleSqlAdmission({ctx:f.ctx,target:{
    pid:IDS.project,bid:IDS.dev},args:{}})).resolves.toBe(true);
 });
 it('parses fixed catalog reads and only SELECT/USAGE plus exact future defaults',async()=>{
  const f=make();
  await runFixedReviewedSql(f.query,'SELECT 1 AS one');
  await runFixedReviewedSql(f.query,'GRANT USAGE ON SCHEMA "public" TO "reader"');
  await runFixedReviewedSql(f.query,'GRANT SELECT ON ALL TABLES IN SCHEMA "public" TO "reader"');
  await runFixedReviewedSql(f.query,
    'ALTER DEFAULT PRIVILEGES FOR ROLE "owner" IN SCHEMA "public" GRANT SELECT ON TABLES TO "reader"');
  expect(f.called()).toBe(4);
  for(const sql of ['DELETE FROM users','GRANT ALL ON SCHEMA "public" TO "reader"',
    'ALTER DEFAULT PRIVILEGES FOR ROLE "owner" IN SCHEMA "public" GRANT ALL ON TABLES TO "reader"',
    'SELECT 1; DROP ROLE reader']){
    await expect(runFixedReviewedSql(f.query,sql)).rejects.toThrow();
  }
  expect(f.called()).toBe(4);
 });
});
