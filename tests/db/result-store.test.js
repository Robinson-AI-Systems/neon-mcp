import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb} from '../../src/db.js';
import {resultScope} from '../../src/core/result-store.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db,conn;
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());
 db=createDb(neonShapedQuery());await db.initSchema();
 conn=resultScope({clientId:'fake-A',neonOrg:'org-fake',projectScope:null,mode:'preview',profile:'full'});});
afterAll(async()=>{await closeIsolatedSchema();});
it('keeps scrubbed JSON behind same-connection scope, with no ciphertext',async()=>{
 const handle='res_'+'a'.repeat(40),date=new Date(Date.now()+60000);
 await db.saveResultHandle({handle,connection:conn,summary:'fake result',body:{
  id:'safe',nested:{api_key:'napi_FAKE_SECRET',password:'not stored'}},expiresAt:date});
 expect((await db.readResultHandle({handle,connection:conn})).body).toEqual({id:'safe',nested:{}});
 expect(await db.readResultHandle({handle,connection:'b'.repeat(64)})).toBeNull();
 const rows=await rawQuery('SELECT body FROM result_store WHERE handle=$1',[handle]);
 expect(JSON.stringify(rows)).not.toMatch(/FAKE_SECRET|not stored/);
});
it('expires handles and prunes only bounded expired entries during another write',async()=>{
 const past='res_'+'b'.repeat(40);
 await rawQuery("INSERT INTO result_store(handle,connection,expires_at,body) VALUES($1,$2,now()-interval '1 hour','{}'::jsonb)",[past,conn]);
 expect(await db.readResultHandle({handle:past,connection:conn})).toBeNull();
 await db.saveResultHandle({handle:'res_'+'c'.repeat(40),connection:conn,summary:'new',
  body:{count:1},expiresAt:new Date(Date.now()+60000)});
 expect((await rawQuery('SELECT handle FROM result_store WHERE handle=$1',[past]))).toHaveLength(0);
});
it('refuses invalid handles, unscoped reads and excessive retention',async()=>{
 await expect(db.saveResultHandle({handle:'wrong',connection:conn,summary:'no',
  body:{},expiresAt:new Date(Date.now()+10000)})).rejects.toThrow();
 await expect(db.saveResultHandle({handle:'res_'+'d'.repeat(40),connection:conn,summary:'no',
  body:{},expiresAt:new Date(Date.now()+3*86400000)})).rejects.toThrow();
 await expect(db.readResultHandle({handle:'wrong',connection:conn})).rejects.toThrow();
});
