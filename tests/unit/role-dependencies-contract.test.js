import {describe,it,expect} from 'vitest';
import {inspectRoleDeletionDependencies} from '../../src/neon/role-dependencies.js';

function fixture({override={},sessionCounts=[0,0]}={}){
  const statements=[],activity=[...sessionCounts];
  const query=async(sql,values=[])=>{
    statements.push({sql,values});
    if(sql==='BEGIN READ ONLY'||sql==='COMMIT'||sql==='ROLLBACK'||
       sql.startsWith('SET LOCAL'))return {rows:[]};
    if(sql.includes('FROM pg_roles WHERE rolname=$1'))return {rows:[
      {oid:181,rolname:'unused_reader',rolsuper:false,rolcreaterole:false,
       rolcreatedb:false,rolreplication:false,rolbypassrls:false,
       ...override.principal}]};
    if(sql.includes("current_setting('is_superuser')"))return {rows:[
      {is_superuser:true,can_monitor:false,...override.visibility}]};
    if(sql.includes("current_setting('transaction_read_only')"))return {rows:[
      {read_only:true,...override.readOnly}]};
    if(sql.includes('FROM pg_shdepend'))return {rows:override.references??[]};
    if(sql.includes('FROM pg_database'))return {rows:override.databaseOwners??[]};
    if(sql.includes('FROM pg_auth_members a JOIN'))return {rows:override.memberDetails??[]};
    if(sql.includes('FROM pg_auth_members'))return {rows:[
      {amount:0,...override.membership}]};
    if(sql.includes('FROM pg_stat_activity'))return {rows:[
      {sessions:activity.shift(),...override.activity}]};
    throw Error('Unexpected SQL: '+sql);
  };
  return {query,statements};
}

describe('D-4 role-dependency evidence never turns unknown into zero',()=>{
  it('accepts a verified read-only transaction and stable two-sample session inventory',async()=>{
    const f=fixture();
    const result=await inspectRoleDeletionDependencies(f.query,'unused_reader');
    expect(result).toMatchObject({verified:true,clear:true,sessionSamples:2,
      readOnlyTransactionVerified:true,totals:{activeSessions:0}});
    expect(f.statements.filter(x=>x.sql.includes('FROM pg_stat_activity'))).toHaveLength(2);
    expect(f.statements.at(-1).sql).toBe('COMMIT');
    expect(f.statements.every(x=>!/DROP ROLE|DELETE FROM|GRANT /.test(x.sql))).toBe(true);
  });
  it.each([
    ['null',null],['empty',''],['boolean',false],['float',1.1],
    ['negative',-1],['huge','9007199254740992'],['garbage','unknown']
  ])('refuses %s activity count rather than silently treating it as zero',async(_,bad)=>{
    const f=fixture({override:{activity:{sessions:bad}}});
    await expect(inspectRoleDeletionDependencies(f.query,'unused_reader'))
      .rejects.toThrow(/could not be completely verified/);
    expect(f.statements.at(-1).sql).toBe('ROLLBACK');
  });
  it('refuses invalid membership counts and invalid catalog references',async()=>{
    for(const override of [
      {membership:{amount:null}},
      {membership:{amount:''}},
      {references:[{database_oid:'0',object_catalog:'pg_class',
        deptype:'o',amount:false}]},
      {references:[{database_oid:'not-an-oid',object_catalog:'pg_class',
        deptype:'o',amount:1}]}
    ]){
      const f=fixture({override});
      await expect(inspectRoleDeletionDependencies(f.query,'unused_reader'))
        .rejects.toThrow(/could not be completely verified/);
      expect(f.statements.at(-1).sql).toBe('ROLLBACK');
    }
  });
  it('rejects missing read-only evidence and invalid target OIDs',async()=>{
    for(const override of [{readOnly:{read_only:false}},{principal:{oid:null}}]){
      const f=fixture({override});
      await expect(inspectRoleDeletionDependencies(f.query,'unused_reader'))
        .rejects.toThrow(/could not be completely verified/);
      expect(f.statements.at(-1).sql).toBe('ROLLBACK');
    }
  });
  it('rejects changing sessions during the probe even if first count is zero',async()=>{
    const f=fixture({sessionCounts:[0,2]});
    await expect(inspectRoleDeletionDependencies(f.query,'unused_reader'))
      .rejects.toThrow(/could not be completely verified/);
    expect(f.statements.at(-1).sql).toBe('ROLLBACK');
  });
  it('retains nonzero catalog dependencies as blockers without executing DDL',async()=>{
    const f=fixture({override:{references:[{database_oid:'0',
      object_catalog:'pg_class',deptype:'o',amount:'2'}]}});
    const result=await inspectRoleDeletionDependencies(f.query,'unused_reader');
    expect(result.clear).toBe(false);
    expect(result.totals.objectReferences).toBe(2);
  });
});
