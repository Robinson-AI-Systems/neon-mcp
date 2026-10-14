import {beforeAll,afterAll,it,expect} from 'vitest';
import pg from 'pg';
import {requireLocalDatabaseUrl} from './local-url.js';
import {runReviewedExtensionMutation} from '../../src/neon/sql-run.js';
let admin,client,dbname;
beforeAll(async()=>{
 admin=new pg.Client({connectionString:requireLocalDatabaseUrl()});await admin.connect();
 dbname='extension_test_'+Date.now();
 await admin.query('CREATE DATABASE "'+dbname+'"');
 const url=new URL(requireLocalDatabaseUrl());url.pathname='/'+dbname;
 client=new pg.Client({connectionString:url.toString()});await client.connect();
});
afterAll(async()=>{await client?.end();if(admin){await admin.query('DROP DATABASE IF EXISTS "'+dbname+'"');await admin.end();}});
const ctx={db:{},connection:{neonOrg:'org-fake'}};
const target={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 expectedEndpointHost:'direct.invalid',database:'neondb',role:'owner',pooled:false};
const run=(name,update=false,sqlLayer=async(_scope,_target,fn)=>fn(client))=>
 runReviewedExtensionMutation({ctx,target,name,update,sqlLayer});
it('installs, upgrades and independently observes an actual extension',async()=>{
 expect(await run('hstore')).toEqual({issued:true});
 const installed=async()=> (await client.query("SELECT extversion FROM pg_extension WHERE extname='hstore'")).rows[0].extversion;
 const current=await installed();expect(current).toMatch(/^\d/);
 await client.query('DROP EXTENSION hstore');
 const versions=(await client.query("SELECT version FROM pg_available_extension_versions WHERE name='hstore' AND version<>$1 ORDER BY version LIMIT 1",[current])).rows;
 expect(versions).toHaveLength(1);
 await client.query('CREATE EXTENSION hstore VERSION '+"'"+versions[0].version+"'");
 expect(await installed()).not.toBe(current);
 expect(await run('hstore',true)).toEqual({issued:true});
 expect(await installed()).toBe(current);
});
it('rolls back actual DDL on a pre-commit failure and leaves no installed extension',async()=>{
 const layer=async(_scope,_target,fn)=>fn({query:async(text)=>{
  const result=await client.query(text);
  if(text.startsWith('CREATE EXTENSION'))throw Error('fixture pre-commit failure');
  return result;
 }});
 await expect(run('citext',false,layer)).rejects.toThrow(/not confirmed/);
 expect((await client.query("SELECT extname FROM pg_extension WHERE extname='citext'")).rows).toEqual([]);
});
