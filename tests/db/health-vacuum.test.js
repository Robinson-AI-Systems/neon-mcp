import {beforeAll,afterAll,it,expect} from 'vitest';
import pg from 'pg';
import {requireLocalDatabaseUrl} from './local-url.js';
import {createVacuumHandlers,VACUUM_STATS_SQL} from '../../src/tools/health-vacuum.js';
import {runReviewedVacuumMutation} from '../../src/neon/sql-run.js';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
let admin,client,name;
beforeAll(async()=>{
 admin=new pg.Client({connectionString:requireLocalDatabaseUrl()});await admin.connect();
 name='vacuum_test_'+Date.now();await admin.query('CREATE DATABASE "'+name+'"');
 const url=new URL(requireLocalDatabaseUrl());url.pathname='/'+name;
 client=new pg.Client({connectionString:url.toString()});await client.connect();
 await client.query('CREATE TABLE people (id int PRIMARY KEY, code text)');
 await client.query("INSERT INTO people VALUES (1,'a'),(2,'b'),(3,'c')");
 await client.query('DELETE FROM people WHERE id=3');
});
afterAll(async()=>{await client?.end();if(admin){
 await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end();}});
const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'public',tableName:'people'};
it('audits a genuine disposable PostgreSQL VACUUM ANALYZE and preserves rows',async()=>{
 const f=makeContractFixture(),ctx=f.ctx;
 ctx.connection={neonOrg:'org-fake',profile:'full',mode:'preview'};
 ctx.getBranch=async()=>({id:args.branchId});
 ctx.db.getSqlMaintenanceTimeoutMs=async()=>600000;
 const h=createVacuumHandlers({contextFor:async()=>ctx,
  verifyTarget:async x=>({pid:x.projectId,bid:x.branchId,endpointId:x.endpointId,
   database:x.databaseName,role:x.roleName,endpoint:{host:'direct.fake'}}),
  query:async({text,params})=>{
   await client.query('BEGIN READ ONLY');
   try{const data=await client.query(text,params);await client.query('COMMIT');
    return {done:true,truncated:false,rowCount:data.rows.length,rows:data.rows};}
   catch(e){await client.query('ROLLBACK');throw e;}
  },
  mutate:x=>runReviewedVacuumMutation({...x,
   sqlLayer:async(_c,_t,callback)=>callback(client)})}).handlers;
 const parsed=result=>JSON.parse(result.content[0].text);
 const preview=parsed(await h.neon_health_vacuum_analyze({...args,dryRun:true},ctx));
 expect(preview.done).toBe(false);
 const result=parsed(await h.neon_health_vacuum_analyze({...args,confirm:true},ctx));
 expect(result,JSON.stringify(result)).toMatchObject({done:true,confirmed:true});
 expect((await client.query('SELECT id,code FROM people ORDER BY id')).rows)
  .toEqual([{id:1,code:'a'},{id:2,code:'b'}]);
 const stats=(await client.query(VACUUM_STATS_SQL,['public','people'])).rows;
 expect(stats).toHaveLength(1);expect(stats[0].relation_kind).toBe('r');
 expect(stats[0].manual_vacuum_count).toMatch(/^\d+$/);
 const denied=parsed(await h.neon_health_vacuum_analyze({...args,
  schemaName:'pg_catalog',confirm:true},ctx));
 expect(denied.done).toBe(false);
});
