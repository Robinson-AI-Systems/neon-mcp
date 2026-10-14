import {beforeAll,afterAll,it,expect} from 'vitest';
import pg from 'pg';
import {requireLocalDatabaseUrl} from './local-url.js';
import {createIndexWriteHandlers,INDEX_INVENTORY_SQL} from '../../src/tools/schema-index-write.js';
import {runReviewedIndexMutation} from '../../src/neon/sql-run.js';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
let admin,client,name;
beforeAll(async()=>{
 admin=new pg.Client({connectionString:requireLocalDatabaseUrl()});await admin.connect();
 name='index_test_'+Date.now();await admin.query('CREATE DATABASE "'+name+'"');
 const url=new URL(requireLocalDatabaseUrl());url.pathname='/'+name;
 client=new pg.Client({connectionString:url.toString()});await client.connect();
 await client.query('CREATE TABLE people (id integer PRIMARY KEY, code text)');
 await client.query("INSERT INTO people VALUES (1,'a'),(2,'b'),(3,'c')");
});
afterAll(async()=>{await client?.end();if(admin){await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end();}});
const a={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',databaseName:'neondb',
 roleName:'owner',schemaName:'public',tableName:'people',indexName:'people_code_idx',columns:['code']};
it('executes confirmed concurrent create/drop with catalog readback and preserved records',async()=>{
 const f=makeContractFixture(),c=f.ctx;
 c.connection={neonOrg:'org-fake',profile:'full',mode:'preview'};
 c.getBranch=async()=>({id:a.branchId});c.writeKey=tool=>'rmcp_index_pg_'+tool;
 const handlers=createIndexWriteHandlers({contextFor:async()=>c,
  verifyTarget:async x=>({pid:x.projectId,bid:x.branchId,endpointId:x.endpointId,
   database:x.databaseName,role:x.roleName,endpoint:{host:'direct.fake'}}),
  query:async({text,params})=>{
   await client.query('BEGIN READ ONLY');
   try{const result=await client.query(text,params);await client.query('COMMIT');
    return {done:true,truncated:false,rowCount:result.rows.length,rows:result.rows};}
   catch(e){await client.query('ROLLBACK');throw e;}
  },mutate:x=>runReviewedIndexMutation({...x,sqlLayer:async(_scope,_target,fn)=>fn(client)})}).handlers;
 const json=x=>JSON.parse(x.content[0].text);
 expect(json(await handlers.neon_schema_create_index({...a,dryRun:true},c)).done).toBe(false);
 expect((await client.query(INDEX_INVENTORY_SQL,['public'])).rows.some(x=>x.index_name===a.indexName)).toBe(false);
 expect(json(await handlers.neon_schema_create_index({...a,confirm:true},c))).toMatchObject({done:true,confirmed:true});
 const installed=(await client.query(INDEX_INVENTORY_SQL,['public'])).rows.find(x=>x.index_name===a.indexName);
 expect(installed).toMatchObject({valid_index:true,ready_index:true,columns:['code'],constraint_index:false});
 const {columns:_columns,...drop}=a;
 expect(json(await handlers.neon_schema_drop_index({...drop,confirm:true},c))).toMatchObject({done:true,confirmed:true});
 expect((await client.query(INDEX_INVENTORY_SQL,['public'])).rows.some(x=>x.index_name===a.indexName)).toBe(false);
 expect((await client.query('SELECT count(*)::int AS n FROM people')).rows[0].n).toBe(3);
 const guarded=json(await handlers.neon_schema_drop_index({...drop,indexName:'people_pkey',confirm:true},c));
 expect(guarded.done).toBe(false);
 expect((await client.query('SELECT count(*)::int AS n FROM people')).rows[0].n).toBe(3);
});
