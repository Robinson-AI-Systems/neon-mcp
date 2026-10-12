import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {grantReadOnlyPrivileges} from '../../src/neon/role-privileges.js';

let schema,owner,reader,other;
const q = (s, p = []) => rawQuery(s,p).then(rows => ({rows}));
const quoted = s => '"' + s + '"';
beforeAll(async()=>{
  schema=await openIsolatedSchema(requireLocalDatabaseUrl());
  owner=(await rawQuery('SELECT current_user AS name'))[0].name;
  const suffix=randomBytes(4).toString('hex');
  reader='rmcp_reader_'+suffix;
  other='rmcp_other_'+suffix;
  await rawQuery('CREATE ROLE '+quoted(reader)+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
  await rawQuery('CREATE ROLE '+quoted(other)+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
  await rawQuery('CREATE TABLE initial_table (id int)');
});
afterAll(async()=>{
  if(reader){
    await rawQuery('DROP OWNED BY '+quoted(reader)).catch(()=>{});
    await rawQuery('DROP ROLE IF EXISTS '+quoted(reader)).catch(()=>{});
  }
  if(other){
    await rawQuery('DROP OWNED BY '+quoted(other)).catch(()=>{});
    await rawQuery('DROP ROLE IF EXISTS '+quoted(other)).catch(()=>{});
  }
  await closeIsolatedSchema();
});
it('commits current SELECT and owner-specific future defaults without INSERT or CREATE',async()=>{
  const result=await grantReadOnlyPrivileges(q,{reader,owner,schemas:[schema]});
  expect(result).toMatchObject({verified:true,role:reader,existingRelations:1,
    futureTablesForOwnerVerified:true});
  await rawQuery('CREATE TABLE future_table (id int)');
  const permissions=await rawQuery(
    "SELECT has_table_privilege($1, $2,'SELECT') AS selected, has_table_privilege($1,$2,'INSERT') AS inserted",
    [reader,schema+'.future_table']);
  expect(permissions[0]).toEqual({selected:true,inserted:false});
});
it('rejects foreign schema ownership, unknown roles and injection without additional grants',async()=>{
  await expect(grantReadOnlyPrivileges(q,{reader:other,owner:'missing_owner',schemas:[schema]}))
    .rejects.toThrow(/not fully verified/);
  await expect(grantReadOnlyPrivileges(q,{reader:other,owner,schemas:['public; DROP SCHEMA public']}))
    .rejects.toThrow(/distinct role/);
  expect((await rawQuery(
    "SELECT has_table_privilege($1,$2,'SELECT') AS allowed",
    [other,schema+'.initial_table']))[0].allowed).toBe(false);
});
it('refuses an elevated or inherited member instead of falsely claiming read-only',async()=>{
  await rawQuery('GRANT '+quoted(owner)+' TO '+quoted(other));
  await expect(grantReadOnlyPrivileges(q,{reader:other,owner,schemas:[schema]}))
    .rejects.toThrow(/not fully verified/);
  await rawQuery('REVOKE '+quoted(owner)+' FROM '+quoted(other));
});
