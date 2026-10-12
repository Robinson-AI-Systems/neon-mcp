import { describe,expect,it } from 'vitest';
import * as neonRaw from '@neon/sdk/raw';
import { createFakeDb } from '../../test/helpers/fake-db.js';
import { makeFakeNeon } from '../../test/helpers/fake-neon.js';
import { createSqlLayer } from '../../src/neon/sql.js';
import * as fx from '../../test/helpers/neon-fixtures.js';

const key='napi_FAKE_sql_connection_fixture_key';
const ctx={neonOrg:fx.IDS.org,projectScope:fx.IDS.project,mode:'preview'};
const target={projectId:fx.IDS.project,branchId:fx.IDS.dev,database:'neondb',role:'neondb_owner',pooled:true};
const self='postgresql://fake@service.fake.invalid/internal';
function fixture(uri='postgresql://fake_user@db.fake.invalid/test') {
  const fake=makeFakeNeon();fake.when('getConnectionURI').resolves({uri});
  const calls=[];let released=0,ended=0,opened=0;
  const poolFactory=async config=>{
    opened++;calls.push({factory:true,host:new URL(config.connectionString).hostname});
    return {async connect(){return {async query(sql){calls.push({query:sql});return {rows:[{answer:42}]};},
      release(){released++;}};},async end(){ended++;}};
  };
  const vault={async keyFor(){return {key,kind:'project'};}};
  const db=createFakeDb();
  const run=createSqlLayer({db,vault,fetch:fake.fetch,poolFactory,env:{DATABASE_URL:self}});
  return {fake,calls,run,stats:()=>({released,ended,opened})};
}
describe('bounded Neon SQL layer',()=>{
  it('uses the actual pinned generated SDK function name',()=>{
    expect(typeof neonRaw.getConnectionUri).toBe('function');
  });
  it('uses Neon connection URI operation, safe client and releases every connection',async()=>{
    const {fake,calls,run,stats}=fixture();
    const out=await run(ctx,target,async client=>{
      expect(Object.keys(client)).toEqual(['query']);
      expect(client.connectionParameters).toBeUndefined();
      return (await client.query('SELECT 42 AS answer')).rows;
    });
    expect(out).toEqual([{answer:42}]);
    expect(calls.map(x=>x.query).filter(Boolean)).toEqual([
      'SET statement_timeout = 15000','SET lock_timeout = 5000','SELECT 42 AS answer']);
    expect(fake.calls.map(x=>x.operationId)).toEqual(['getConnectionURI']);
    expect(fake.calls[0].query.pooled).toBe('true');
    expect(stats()).toEqual({released:1,ended:1,opened:1});
    fake.assertClean();
  });
  it('blocks this service database before creating an external pool',async()=>{
    const {run,stats}=fixture('postgresql://fake@service.fake.invalid/other');
    await expect(run(ctx,target,async()=>42)).rejects.toThrow(/Unable to connect/);
    expect(stats().opened).toBe(0);
  });
  it('refuses a project outside the OAuth project scope before contacting Neon',async()=>{
    const {run,fake}=fixture();
    await expect(run(ctx,{...target,projectId:'proj-fake-other'},async()=>42))
      .rejects.toThrow(/outside/);
    expect(fake.calls).toHaveLength(0);
  });
  it('always releases on callback failure, sanitizes errors and returned URI',async()=>{
    const uri='postgresql://fake_user@db.fake.invalid/test';
    const {run,stats}=fixture(uri);
    expect(await run(ctx,target,async()=>({connection:uri}))).toEqual({
      connection:'[redacted connection]'});
    await expect(run(ctx,target,async()=>{throw new Error(uri);})).rejects
      .toThrow(/Unable to connect/);
    expect(stats()).toEqual({released:2,ended:2,opened:2});
  });
  it('rejects pooled aliases instead of treating them as the verified direct endpoint',async()=>{
    const selected={...target,pooled:false,database:'neondb',role:'neondb_owner',
      expectedEndpointHost:'db.fake.invalid'};
    const direct=fixture('postgresql://neondb_owner@db.fake.invalid/neondb');
    await expect(direct.run(ctx,selected,async()=>true)).resolves.toBe(true);
    const alias=fixture('postgresql://neondb_owner@db-pooler.fake.invalid/neondb');
    await expect(alias.run(ctx,selected,async()=>true)).rejects.toThrow(/Unable to connect/);
    expect(alias.stats().opened).toBe(0);
    const opposite=fixture('postgresql://neondb_owner@db.fake.invalid/neondb');
    await expect(opposite.run(ctx,{...selected,expectedEndpointHost:'db-pooler.fake.invalid'},
      async()=>true)).rejects.toThrow(/Unable to connect/);
    expect(opposite.stats().opened).toBe(0);
  });
  it('refuses absent database identity configuration',async()=>{
    const db=createFakeDb(),vault={async keyFor(){return {key};}};
    const run=createSqlLayer({db,vault,env:{}});
    await expect(run(ctx,target,async()=>42)).rejects.toThrow(/database URL/);
  });
});
