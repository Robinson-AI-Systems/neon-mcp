import {beforeAll,afterAll,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {compilePublicImport,verifyPublicImport} from '../../src/dev/import-plan.js';
const key='rmcp_import_postgres_fixture_abcdef123456';
const schemas=[];
function source(rows){
 const text=JSON.stringify(rows);
 return {kind:'json',host:'raw.githubusercontent.com',text,
  sha256:createHash('sha256').update(text).digest('hex'),
  byteLength:Buffer.byteLength(text)};
}
async function apply(plan){
 schemas.push(plan.schema);
 await rawQuery('BEGIN');
 try{
  for(let i=0;i<plan.statements.length;i++)
   await rawQuery(plan.statements[i],plan.params[i]);
  await rawQuery('COMMIT');
 }catch(e){await rawQuery('ROLLBACK');throw e;}
}
const query=async(sql,params)=>({rows:await rawQuery(sql,params)});
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());});
afterAll(async()=>{
 try{
  for(const schema of schemas.reverse()){
   if(!/^rmcp_import_[0-9a-f]{24}$/.test(schema))throw Error('Unowned import fixture');
   await rawQuery('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
  }
 }finally{await closeIsolatedSchema();}
});
it('loads a typed public-JSON-shaped single table and verifies constraints',async()=>{
 const plan=compilePublicImport({source:source([
  {sku:'DEMO-1',email:'demo1@example.com',price_cents:1200,
   available:true,launch_on:'2024-01-01'},
  {sku:'DEMO-2',email:'demo2@example.com',price_cents:1400,
   available:false,launch_on:'2024-01-02'}
 ]),requestKey:key});
 await apply(plan);
 expect(await verifyPublicImport({plan,query})).toBe(true);
 expect(await rawQuery('SELECT count(*)::int AS n FROM "'+plan.schema+'".import_rows'))
  .toEqual([{n:2}]);
 await expect(rawQuery('INSERT INTO "'+plan.schema+
  '".import_rows(id,sku,email,price_cents,available,launch_on) VALUES (9,$1,$2,$3,$4,$5)',
  ['DEMO-1','new@example.com',1000,true,'2024-01-03']))
  .rejects.toMatchObject({code:'23505'});
 expect(await verifyPublicImport({plan,query})).toBe(true);
});
it('loads and checks all 500 bounded public rows in one audited SQL plan',async()=>{
 const rows=Array.from({length:500},(_,i)=>({
  sku:'SKU-'+(i+1),price_cents:1000+i,available:i%2===0}));
 const p=compilePublicImport({source:source(rows),requestKey:key});
 expect(p.statements.length).toBeLessThanOrEqual(20);
 await apply(p);
 expect(await verifyPublicImport({plan:p,query})).toBe(true);
 expect(await rawQuery('SELECT count(*)::int AS n FROM "'+p.schema+'".import_rows'))
  .toEqual([{n:500}]);
 await rawQuery('UPDATE "'+p.schema+'".import_rows SET price_cents=$1 WHERE id=$2',
  [9999,1]);
 expect(await verifyPublicImport({plan:p,query})).toBe(false);
});
