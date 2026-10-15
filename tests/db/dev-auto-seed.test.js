import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {compileAutoSeed,verifyAutoSeed} from '../../src/dev/auto-plan.js';

const schema='auto_fixture_six_tables';
const key='rmcp_pg_auto_six_tables_123456789abcdef';
const quoted='"'+schema+'"';
let created=false;
const run=async(sql,params=[])=>rawQuery(sql,params);
beforeAll(async()=>{
 await openIsolatedSchema(requireLocalDatabaseUrl());
 await run('CREATE SCHEMA '+quoted);
 created=true;
 await run('CREATE TABLE '+quoted+'.organizations (id integer PRIMARY KEY,name text NOT NULL)');
 await run('CREATE TABLE '+quoted+'.users (id integer PRIMARY KEY,organization_id integer NOT NULL REFERENCES '+
  quoted+'.organizations(id),email text NOT NULL UNIQUE)');
 await run('CREATE TABLE '+quoted+'.plans (id integer PRIMARY KEY,slug text NOT NULL UNIQUE,price_cents integer NOT NULL CHECK (price_cents >= 0))');
 await run('CREATE TABLE '+quoted+'.subscriptions (id integer PRIMARY KEY,user_id integer NOT NULL REFERENCES '+
  quoted+'.users(id),plan_id integer NOT NULL REFERENCES '+quoted+'.plans(id),status text NOT NULL)');
 await run('CREATE TABLE '+quoted+'.invoices (id integer PRIMARY KEY,subscription_id integer NOT NULL REFERENCES '+
  quoted+'.subscriptions(id),amount_cents integer NOT NULL CHECK (amount_cents >= 0))');
 await run('CREATE TABLE '+quoted+'.payments (id integer PRIMARY KEY,invoice_id integer NOT NULL REFERENCES '+
  quoted+'.invoices(id),paid_on date NOT NULL,quantity integer NOT NULL CHECK (quantity > 0))');
});
afterAll(async()=>{
 try {
  if(created)await run('DROP SCHEMA '+quoted+' CASCADE');
 }finally{await closeIsolatedSchema();}
});
async function plan(rowsPerTable=5){
 return compileAutoSeed({existingSchema:schema,rowsPerTable,
  requestKey:key,query:run});
}
it('loads six related existing PostgreSQL tables with exact FK/check/unique and readback',async()=>{
 const p=await plan();
 expect(p.tableCount).toBe(6);
 expect(p.totalRows).toBe(30);
 expect(p.totalSkipped).toBe(0);
 expect(p.statements.length).toBe(6);
 expect(p.tables.map(t=>t.name)).toEqual(expect.arrayContaining([
  'organizations','users','plans','subscriptions','invoices','payments']));
 await run('BEGIN');
 try{
  for(let i=0;i<p.statements.length;i++){
   const inserted=await run(p.statements[i],p.params[i]);
   expect(inserted).toHaveLength(0);
  }
  await run('COMMIT');
 }catch(e){await run('ROLLBACK');throw e;}
 const verified=await verifyAutoSeed({plan:p,query:async(sql,args)=>({rows:await run(sql,args)})});
 expect(verified).toBe(true);
 for(const table of p.tables){
  const count=await run('SELECT count(*)::integer AS n FROM '+quoted+'."'+table.name+'"');
  expect(count).toEqual([{n:5}]);
 }
 const conflicting=await plan();
 expect(conflicting.totalSkipped).toBe(30);
 expect(conflicting.totalRows).toBe(0);
 expect(conflicting.statements).toHaveLength(0);
});
it('rejects an altered unique/check/FK catalog before a second write',async()=>{
 await run('ALTER TABLE '+quoted+'.plans ADD CONSTRAINT price_below_ceiling CHECK (price_cents < 1000)');
 try{
  await expect(plan()).rejects.toThrow(/safe six-table/);
 }finally{
  await run('ALTER TABLE '+quoted+'.plans DROP CONSTRAINT price_below_ceiling');
 }
});
it('rejects tampered inserted cells and preserves existing rows',async()=>{
 const p=await compileAutoSeed({existingSchema:schema,rowsPerTable:5,
  requestKey:'rmcp_pg_auto_new_key_abcdef123456789',query:run});
 await run('BEGIN');
 try{
  for(let i=0;i<p.statements.length;i++)await run(p.statements[i],p.params[i]);
  await run('COMMIT');
 }catch(e){await run('ROLLBACK');throw e;}
 expect(await verifyAutoSeed({plan:p,query:async(sql,args)=>({rows:await run(sql,args)})})).toBe(true);
 const planTable=p.tables.find(t=>t.name==='plans');
 await run('UPDATE '+quoted+'.plans SET price_cents=5000 WHERE id=$1',[planTable.rows[0].id]);
 expect(await verifyAutoSeed({plan:p,query:async(sql,args)=>({rows:await run(sql,args)})})).toBe(false);
 const untouched=await run('SELECT count(*)::integer AS n FROM '+quoted+'.plans');
 expect(untouched).toEqual([{n:10}]);
});
it('real PostgreSQL refuses invalid FK and CHECK despite parameterized generic insertion',async()=>{
 await expect(run('INSERT INTO '+quoted+'.invoices (id,subscription_id,amount_cents) VALUES ($1,$2,$3)',
  [2000000000,2000000000,5])).rejects.toMatchObject({code:'23503'});
 await expect(run('INSERT INTO '+quoted+'.plans (id,slug,price_cents) VALUES ($1,$2,$3)',
  [2000000000,'synthetic-check-example',-3])).rejects.toMatchObject({code:'23514'});
});