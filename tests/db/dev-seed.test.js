import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {compileDemoSeed,verifyDemoSeed} from '../../src/dev/seed-plan.js';

const key='rmcp_pg_demo_1234567890abcdef';
const created=[];
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());});
afterAll(async()=>{
 try{
  for(const schema of created.reverse()){
   if(!/^rmcp_demo_[0-9a-f]{24}$/.test(schema))throw Error('Invalid owned fixture schema');
   await rawQuery('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
  }
 }finally{await closeIsolatedSchema();}
});
it('creates all four fully constrained synthetic relational datasets in disposable PostgreSQL',async()=>{
 for(const scenario of ['saas','store','rental','blog']){
  const p=compileDemoSeed({scenario,requestKey:key,rowsPerTable:8,seed:'pgtest'});
  created.push(p.schema);
  await rawQuery('BEGIN');
  try{
   for(let i=0;i<p.statements.length;i++)
    await rawQuery(p.statements[i],p.params[i]);
   await rawQuery('COMMIT');
  }catch(e){await rawQuery('ROLLBACK');throw e;}
  expect(await verifyDemoSeed({plan:p,query:async(sql,params)=>
   ({rows:await rawQuery(sql,params)})})).toBe(true);
  for(const t of p.tables){
   const rows=await rawQuery('SELECT count(*)::int AS total FROM "'+
    p.schema+'"."'+t.name+'"');
   expect(rows).toEqual([{total:8}]);
  }
 }
});
it('rejects duplicate unique emails and invalid foreign keys in the real database',async()=>{
 const p=compileDemoSeed({scenario:'rental',requestKey:key,rowsPerTable:8,seed:'pgtest'});
 const email=p.tables.find(x=>x.name==='customers').rows[0].email;
 await expect(rawQuery('INSERT INTO "'+p.schema+
  '"."customers" ("id","email","phone") VALUES ($1,$2,$3)',
  [999,email,'+1-202-555-0199'])).rejects.toMatchObject({code:'23505'});
 await expect(rawQuery('INSERT INTO "'+p.schema+
  '"."agreements" ("id","customer_id","item_id","starts_on") VALUES ($1,$2,$3,$4)',
  [999,999,1,'2024-01-01'])).rejects.toMatchObject({code:'23503'});
 expect(await verifyDemoSeed({plan:p,query:async(sql,params)=>
  ({rows:await rawQuery(sql,params)})})).toBe(true);
});
it('cannot claim successful exact readback after a changed seeded cell',async()=>{
 const p=compileDemoSeed({scenario:'blog',requestKey:key,rowsPerTable:8,seed:'pgtest'});
 await rawQuery('UPDATE "'+p.schema+'"."authors" SET "pen_name"=$1 WHERE "id"=$2',
  ['corrupted',1]);
 expect(await verifyDemoSeed({plan:p,query:async(sql,params)=>
  ({rows:await rawQuery(sql,params)})})).toBe(false);
});
