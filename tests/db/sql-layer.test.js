import { beforeAll,afterAll,expect,it } from 'vitest';
import { createDb } from '../../src/db.js';
import { makeFakeNeon } from '../../test/helpers/fake-neon.js';
import { createSqlLayer } from '../../src/neon/sql.js';
import { localPoolFactory } from '../../test/helpers/sql-client.js';
import { openIsolatedSchema,closeIsolatedSchema,neonShapedQuery } from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';
import * as fx from '../../test/helpers/neon-fixtures.js';
let db;beforeAll(async()=>{
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();
});afterAll(async()=>{await closeIsolatedSchema();});
it('runs a real bounded SQL query in throwaway localhost Postgres through fake Neon URI',async()=>{
  const fake=makeFakeNeon();fake.when('getConnectionURI').resolves({uri:requireLocalDatabaseUrl()});
  const key='napi_FAKE_sql_test_key_fixture';
  const vault={async keyFor(){return {key,kind:'project'};}};
  const layer=createSqlLayer({db,vault,fetch:fake.fetch,poolFactory:localPoolFactory,
    env:{DATABASE_URL:'postgresql://fake@service.fake.invalid/internal'}});
  const result=await layer({neonOrg:fx.IDS.org,projectScope:fx.IDS.project},{
    projectId:fx.IDS.project,branchId:fx.IDS.dev,database:'neondb',role:'neondb_owner',
    pooled:false},async client=>{
    const x=await client.query('SELECT 20 + 22 AS answer');
    const timeout=await client.query('SHOW statement_timeout');
    const lock=await client.query('SHOW lock_timeout');
    return {answer:x.rows[0].answer,statementTimeout:timeout.rows[0].statement_timeout,
      lockTimeout:lock.rows[0].lock_timeout};
  });
  expect(result).toEqual({answer:42,statementTimeout:'15s',lockTimeout:'5s'});
  fake.assertClean();
});
