import {beforeAll,afterAll,it,expect} from 'vitest';
import pg from 'pg';
import {requireLocalDatabaseUrl} from './local-url.js';
import {runReviewedExtensionMutation} from '../../src/neon/sql-run.js';
import {EXTENSION_DEPENDENCIES_SQL,EXTENSION_STATUS_SQL} from '../../src/tools/schema-extension-drop.js';
let admin,client,name;
beforeAll(async()=>{
 admin=new pg.Client({connectionString:requireLocalDatabaseUrl()});await admin.connect();
 name='drop_extension_'+Date.now();await admin.query('CREATE DATABASE "'+name+'"');
 const url=new URL(requireLocalDatabaseUrl());url.pathname='/'+name;
 client=new pg.Client({connectionString:url.toString()});await client.connect();await client.query('CREATE EXTENSION hstore');
});
afterAll(async()=>{await client?.end();if(admin){await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end();}});
const run=()=>runReviewedExtensionMutation({ctx:{db:{},connection:{neonOrg:'org-fake'}},
 target:{projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',expectedEndpointHost:'direct.fake',
 database:'neondb',role:'owner',pooled:false},name:'hstore',remove:true,
 sqlLayer:async(_scope,_target,fn)=>fn(client)});
it('previews a real type dependency; RESTRICT refuses removal without dropping records',async()=>{
 await client.query('CREATE TABLE sample (id integer PRIMARY KEY, payload hstore, multiple hstore[])');
 await client.query("INSERT INTO sample VALUES (1,'a=>b',ARRAY['a=>b'::hstore])");
 const deps=(await client.query(EXTENSION_DEPENDENCIES_SQL,['hstore'])).rows;
 expect(deps.some(x=>x.dependent_object.includes('sample'))).toBe(true);
 await expect(run()).rejects.toThrow(/not confirmed/);
 expect((await client.query('SELECT count(*)::int AS n FROM sample')).rows[0].n).toBe(1);
 expect((await client.query(EXTENSION_STATUS_SQL,['hstore'])).rows).toHaveLength(1);
 await client.query('DROP TABLE sample');
 await client.query('CREATE FUNCTION extension_consumer() RETURNS integer LANGUAGE sql AS \'SELECT 1\'');
 await client.query('ALTER FUNCTION extension_consumer() DEPENDS ON EXTENSION hstore');
 expect((await client.query(EXTENSION_DEPENDENCIES_SQL,['hstore'])).rows.some(x=>x.dependent_object.includes('extension_consumer'))).toBe(true);
 await client.query('DROP FUNCTION extension_consumer()');
 expect((await client.query(EXTENSION_DEPENDENCIES_SQL,['hstore'])).rows).toEqual([]);
 expect(await run()).toEqual({issued:true});
 expect((await client.query(EXTENSION_STATUS_SQL,['hstore'])).rows).toHaveLength(0);
});
