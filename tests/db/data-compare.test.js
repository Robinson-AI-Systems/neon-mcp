import {beforeAll,afterAll,it,expect} from 'vitest';
import pg from 'pg';
import {requireLocalDatabaseUrl} from './local-url.js';
import {createDataCompareHandlers} from '../../src/tools/data-compare.js';
let admin,clients=[],names=[];
beforeAll(async()=>{
 admin=new pg.Client({connectionString:requireLocalDatabaseUrl()});await admin.connect();
 for(let i=0;i<2;i++){
  const name='compare_'+Date.now()+'_'+i;names.push(name);await admin.query('CREATE DATABASE "'+name+'"');
  const url=new URL(requireLocalDatabaseUrl());url.pathname='/'+name;
  const client=new pg.Client({connectionString:url.toString()});await client.connect();clients.push(client);
  await client.query('CREATE TABLE people (id integer PRIMARY KEY, value text)');
  await client.query('CREATE TABLE unkeyed (value text)');
 }
 await clients[0].query("INSERT INTO people VALUES (1,'removed'),(2,'old')");
 await clients[1].query("INSERT INTO people VALUES (2,'new'),(3,'added')");
 await clients[0].query("INSERT INTO unkeyed VALUES ('same'),('same')");
 await clients[1].query("INSERT INTO unkeyed VALUES ('same'),('same')");
});
afterAll(async()=>{for(const client of clients)await client.end();if(admin){for(const name of names)await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end();}});
const side=branchId=>({projectId:'proj-fake',branchId,endpointId:'ep-'+branchId,databaseName:'neondb',roleName:'owner'});
const a={left:side('br-left'),right:side('br-right'),schemaName:'public',tableNames:['people','unkeyed']};
it('compares actual PostgreSQL added/removed/changed rows and unkeyed checksum without mutating',async()=>{
 const handler=createDataCompareHandlers({contextFor:async()=>({}),
  verifyTarget:async x=>({pid:x.projectId,bid:x.branchId,endpointId:x.endpointId,
   database:x.databaseName,role:x.roleName,endpoint:{host:'direct.fake'}}),
  query:async({target,text,params})=>{
   const client=clients[target.branchId==='br-left'?0:1];
   await client.query('BEGIN READ ONLY');
   try{const result=await client.query(text,params);await client.query('COMMIT');
    return {done:true,truncated:false,rowCount:result.rows.length,rows:result.rows};}
   catch(e){await client.query('ROLLBACK');throw e;}
  }}).neon_branch_compare_data;
 const out=JSON.parse((await handler(a,{})).content[0].text);
 expect(out.complete).toBe(true);
 expect(out.tables[0].changes).toEqual({added:1,removed:1,changed:1});
 expect(out.tables[1]).toMatchObject({fingerprintEqual:true,changes:null});
 expect(JSON.stringify(out)).not.toContain('row_hash');expect(JSON.stringify(out)).not.toContain('key_hash');
 for(const client of clients)expect((await client.query('SELECT count(*)::int AS n FROM people')).rows[0].n).toBe(2);
});
