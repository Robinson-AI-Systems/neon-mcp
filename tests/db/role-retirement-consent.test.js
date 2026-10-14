import {beforeAll,afterAll,it,expect} from 'vitest';
import pg from 'pg';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db,schema;
const orgId='org-fake-retirement',target={projectId:'prj-fake-retirement',
 branchId:'br-fake-retirement',roleName:'unused_reader'};
const sample=key=>({orgId,connectionId:'client-fake-one',target,
 tokenHash:key.repeat(64),identityHash:'b'.repeat(64),summary:'Retire unused_reader; pooled clients unknown'});
beforeAll(async()=>{schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 db=createDb(neonShapedQuery());await db.initSchema();});
afterAll(async()=>closeIsolatedSchema());
it('binds consent to its owner, connection, exact role and unchanged snapshot',async()=>{
 const entry=sample('a');await db.recordRoleRetirementPreview(entry);
 for(const altered of [{orgId:'org-other'},{connectionId:'client-other'},
  {identityHash:'c'.repeat(64)},{target:{...target,roleName:'another_role'}}])
  expect(await db.consumeRoleRetirementPreview({...entry,...altered})).toBeNull();
 expect(await db.consumeRoleRetirementPreview(entry)).toHaveProperty('id');
 expect(await db.consumeRoleRetirementPreview(entry)).toBeNull();
});
it('atomically permits one consumer and rejects expired consent',async()=>{
 const entry=sample('d');await db.recordRoleRetirementPreview(entry);
 const clients=[new pg.Client({connectionString:requireLocalDatabaseUrl()}),
  new pg.Client({connectionString:requireLocalDatabaseUrl()})];
 try{
  await Promise.all(clients.map(async c=>{await c.connect();
   await c.query("SELECT set_config('search_path',$1,false)",[schema]);}));
  const stores=clients.map(c=>createDb(async(strings,...values)=>{
   let text=strings[0];for(let i=0;i<values.length;i++)text+='$'+(i+1)+strings[i+1];
   return (await c.query(text,values)).rows;
  }));
  const claimed=await Promise.all(stores.map(store=>store.consumeRoleRetirementPreview(entry)));
  expect(claimed.filter(Boolean)).toHaveLength(1);
 }finally{await Promise.all(clients.map(c=>c.end()));}
 const expired=sample('e');await db.recordRoleRetirementPreview(expired);
 await rawQuery("UPDATE change_log SET sql_preview_expires_at=now()-interval '1 minute' WHERE sql_preview_hash=$1",[expired.tokenHash]);
 expect(await db.consumeRoleRetirementPreview(expired)).toBeNull();
});
it('cannot consume retirement consent as a SQL execution preview',async()=>{
 const entry=sample('f');await db.recordRoleRetirementPreview(entry);
 expect(await db.consumeSqlPreview({orgId,target,tokenHash:entry.tokenHash,
  identityHash:entry.identityHash})).toBeNull();
 expect(await db.consumeRoleRetirementPreview(entry)).toHaveProperty('id');
});
