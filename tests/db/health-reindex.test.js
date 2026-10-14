import {beforeAll,afterAll,it,expect} from 'vitest';
import pg from 'pg';
import {requireLocalDatabaseUrl} from './local-url.js';
import {createReindexHandlers} from '../../src/tools/health-reindex.js';
import {INDEX_INVENTORY_SQL} from '../../src/tools/schema-index-write.js';
import {runReviewedReindexMutation} from '../../src/neon/sql-run.js';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
let admin,client,name;
beforeAll(async()=>{
 admin=new pg.Client({connectionString:requireLocalDatabaseUrl()});await admin.connect();
 name='reindex_test_'+Date.now();await admin.query('CREATE DATABASE "'+name+'"');
 const url=new URL(requireLocalDatabaseUrl());url.pathname='/'+name;
 client=new pg.Client({connectionString:url.toString()});await client.connect();
 await client.query('CREATE TABLE people (id integer PRIMARY KEY, code text, state integer)');
 await client.query('CREATE INDEX people_code_idx ON people (code)');
 await client.query('CREATE INDEX people_state_idx ON people (state)');
 await client.query("INSERT INTO people VALUES (1,'a',1),(2,'b',2),(3,'c',3)");
});
afterAll(async()=>{await client?.end();if(admin){
 await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end();}});
const base={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'public',tableName:'people'};
it('rebuilds INDEX and TABLE concurrently with independently read catalogs and preserved records',async()=>{
 const f=makeContractFixture(),c=f.ctx;
 c.connection={neonOrg:'org-fake',profile:'full',mode:'preview'};
 c.getBranch=async()=>({id:base.branchId});
 c.writeKey=(_name,args)=>'rmcp_reindex_pg_'+args.scope+'_test';
 c.db.getSqlMaintenanceTimeoutMs=async()=>600000;
 const handlers=createReindexHandlers({contextFor:async()=>c,
  verifyTarget:async x=>({pid:x.projectId,bid:x.branchId,endpointId:x.endpointId,
   database:x.databaseName,role:x.roleName,endpoint:{host:'direct.fake'}}),
  query:async({text,params})=>{
   await client.query('BEGIN READ ONLY');
   try{const answer=await client.query(text,params);await client.query('COMMIT');
    return {done:true,truncated:false,rowCount:answer.rows.length,rows:answer.rows};}
   catch(e){await client.query('ROLLBACK');throw e;}
  },
  mutate:x=>runReviewedReindexMutation({...x,
   sqlLayer:async(_scope,_target,callback)=>callback(client)})}).handlers;
 const parsed=x=>JSON.parse(x.content[0].text);
 for(const selection of [{scope:'index',indexName:'people_code_idx'},{scope:'table'}]){
  const args={...base,...selection};
  const preview=parsed(await handlers.neon_health_reindex({...args,dryRun:true},c));
  expect(preview.done).toBe(false);
  const result=parsed(await handlers.neon_health_reindex({...args,confirm:true},c));
  expect(result,JSON.stringify(result)).toMatchObject({done:true,confirmed:true});
  const indexes=(await client.query(INDEX_INVENTORY_SQL,['public'])).rows.filter(x=>x.table_name==='people');
  expect(indexes.length).toBe(3);
  expect(indexes.every(x=>x.valid_index&&x.ready_index)).toBe(true);
 }
 const records=(await client.query('SELECT id,code,state FROM people ORDER BY id')).rows;
 expect(records).toEqual([{id:1,code:'a',state:1},{id:2,code:'b',state:2},{id:3,code:'c',state:3}]);
 await client.query('ALTER TABLE people ADD COLUMN active_range int4range');
 await client.query('ALTER TABLE people ADD CONSTRAINT people_range_excl EXCLUDE USING gist(active_range WITH &&)');
 expect(parsed(await handlers.neon_health_reindex({...base,scope:'table',confirm:true},c)).done).toBe(false);
 expect(parsed(await handlers.neon_health_reindex({...base,scope:'index',
  indexName:'missing_idx',confirm:true},c)).done).toBe(false);
});
