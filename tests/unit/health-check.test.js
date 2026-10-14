import {describe,it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {HEALTH_SQL,HEALTH_CHECKS,HEALTH_DEFAULT,tools,createHealthHandlers}
 from '../../src/tools/health-check.js';
const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner'};
const json=x=>JSON.parse(x.content[0].text);
function fixture({response={done:true,rows:[],rowCount:0,truncated:false},
 foreign=false,denyCheck=null}={}){
 const calls=[],handlers=createHealthHandlers({
  verifyTarget:async a=>({pid:foreign?'other-project':a.projectId,
   bid:a.branchId,endpointId:a.endpointId,database:a.databaseName,
   role:a.roleName,endpoint:{host:'ep-real.neon.tech'}}),
  contextFor:async()=>({trusted:true}),
  runQuery:async input=>{calls.push(input);
   return input.text===HEALTH_SQL[denyCheck]?{done:false,code:'insufficient_privilege'}:response}
 });
 return {calls,handler:handlers.neon_health_check};
}
describe('D-6 fifteen read-only PostgreSQL health diagnostics',()=>{
 it('registers a safe read and AST-classifies fifteen fixed catalog queries',async()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_health_check']);
  expect(tools[0].writes).toBe(false);
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
  expect(HEALTH_CHECKS).toHaveLength(15);
  for(const sql of Object.values(HEALTH_SQL)){
   expect((await classifySql(sql)).kind).toBe('read');
   expect(sql).toMatch(/LIMIT 201$/);
   expect(sql).not.toMatch(/SELECT\s+\*\s+FROM/i);
  }
 });
 it('defaults to useful bounded checks with one verified direct host',async()=>{
  const f=fixture(),x=json(await f.handler(args,{}));
  expect(x.allObserved).toBe(true);
  expect(x.nonAtomic).toBe(true);
  expect(x.requested).toEqual(HEALTH_DEFAULT);
  expect(f.calls.map(x=>x.text)).toEqual(HEALTH_DEFAULT.map(n=>HEALTH_SQL[n]));
  expect(f.calls.every(x=>x.target.pooled===false&&
   x.target.expectedEndpointHost==='ep-real.neon.tech')).toBe(true);
 });
 it('continues safe independent checks when one database read is refused',async()=>{
  const f=fixture({denyCheck:'replication_slots'}),x=json(await f.handler({
   ...args,checks:['replication_slots','xid_age','table_sizes']},{}));
  expect(x.allObserved).toBe(false);
  expect(x.checks.replication_slots).toMatchObject({state:'unavailable',
   code:'insufficient_privilege'});
  expect(x.checks.xid_age.state).toBe('observed');
  expect(f.calls.map(x=>x.text)).toEqual([
   HEALTH_SQL.replication_slots,HEALTH_SQL.xid_age,HEALTH_SQL.table_sizes]);
 });
 it('refuses incomplete catalogs, forged identities and invalid selections',async()=>{
  const f=fixture({response:{done:true,rows:[],rowCount:0,truncated:true}});
  expect(json(await f.handler({...args,checks:['connections']},{}))
   .checks.connections.state).toBe('incomplete');
  const foreign=fixture({foreign:true});
  await expect(foreign.handler(args,{})).rejects.toThrow();
  expect(foreign.calls).toHaveLength(0);
  for(const checks of [['connections','connections'],['wrong_check'],[]]){
   const bad=fixture();
   await expect(bad.handler({...args,checks},{})).rejects.toThrow();
   expect(bad.calls).toHaveLength(0);
  }
 });
});
