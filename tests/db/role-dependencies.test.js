import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {inspectRoleDeletionDependencies} from '../../src/neon/role-dependencies.js';
let reader,owner;
const q=(text,params=[])=>rawQuery(text,params).then(rows=>({rows}));
const quote=x=>'"'+x+'"';
beforeAll(async()=>{
  await openIsolatedSchema(requireLocalDatabaseUrl());
  owner=(await rawQuery('SELECT current_user AS name'))[0].name;
  reader='rmcp_drop_'+randomBytes(4).toString('hex');
  await rawQuery('CREATE ROLE '+quote(reader)+' LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB');
  await rawQuery('CREATE TABLE delete_probe (id int)');
});
afterAll(async()=>{
  if(reader){
    await rawQuery('ALTER TABLE delete_probe OWNER TO '+quote(owner)).catch(()=>{});
    await rawQuery('DROP OWNED BY '+quote(reader)).catch(()=>{});
    await rawQuery('DROP ROLE IF EXISTS '+quote(reader)).catch(()=>{});
  }
  await closeIsolatedSchema();
});
it('proves global dependency, database ownership, membership and sessions inventory is clear',async()=>{
  const proof=await inspectRoleDeletionDependencies(q,reader);
  expect(proof.verified).toBe(true);
  expect(proof.clear).toBe(true);
  expect(proof.totals).toEqual({
    objectReferences:0,databaseOwnerships:0,roleMemberships:0,activeSessions:0});
});
it('finds a role-owned table through pg_shdepend even when only names are supplied',async()=>{
  await rawQuery('ALTER TABLE delete_probe OWNER TO '+quote(reader));
  const proof=await inspectRoleDeletionDependencies(q,reader);
  expect(proof.clear).toBe(false);
  expect(proof.totals.objectReferences).toBeGreaterThan(0);
  await rawQuery('ALTER TABLE delete_probe OWNER TO '+quote(owner));
});
it('never says zero sessions when monitoring privilege or activity is unavailable',async()=>{
  const noMonitor=async(text,params)=>{
    if(text.includes("current_setting('is_superuser')"))
      return {rows:[{is_superuser:false,can_monitor:false}]};
    return q(text,params);
  };
  await expect(inspectRoleDeletionDependencies(noMonitor,reader)).rejects
    .toThrow(/could not be completely verified/);
  const active=async(text,params)=>{
    if(text.includes('FROM pg_stat_activity'))
      return {rows:[{sessions:4}]};
    return q(text,params);
  };
  const proof=await inspectRoleDeletionDependencies(active,reader);
  expect(proof.clear).toBe(false);
  expect(proof.totals.activeSessions).toBe(4);
});
it('rejects invalid or unknown roles and never attempts a deletion statement',async()=>{
  await expect(inspectRoleDeletionDependencies(q,'x"; DROP ROLE postgres;--')).rejects
    .toThrow(/verified PostgreSQL role/);
  await expect(inspectRoleDeletionDependencies(q,'missing_role')).rejects
    .toThrow(/could not be completely verified/);
});
