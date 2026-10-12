import {describe,it,expect} from 'vitest';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {createProjectWriteContext} from '../../src/neon/project-write-context.js';
import {IDS} from '../../test/helpers/neon-fixtures.js';
const json=r=>JSON.parse(r.content[0].text);
describe('D-1 project mutation safety',()=>{
 it('refuses a billable external write without atomic daily spending reservation',async()=>{
  const f=makeContractFixture({spendCents:100});
  delete f.ctx.reserveSpendWrite;
  expect(json(await f.handler({confirm:true},f.ctx)).code).toBe('refused_by_guard');
  expect(f.calls).toHaveLength(0);
 });
 it('reserves spending only after confirmation and before provider mutation',async()=>{
  const f=makeContractFixture({spendCents:100});
  const original=f.ctx.db.reserveWrite;let count=0;
  f.ctx.reserveSpendWrite=async({estimate,write})=>{
   expect(estimate.increaseCents).toBe(100);count++;
   return original(write);
  };
  f.ctx.db.reserveWrite=async()=>{throw Error('unmetered direct reservation');};
  expect(json(await f.handler({dryRun:true},f.ctx)).done).toBe(false);
  expect(count).toBe(0);
  expect(json(await f.handler({confirm:true},f.ctx)).done).toBe(true);
  expect(count).toBe(1);
  expect(f.calls).toHaveLength(1);
 });
 it('never applies when spending capacity admission fails',async()=>{
  const f=makeContractFixture({spendCents:100});
  f.ctx.reserveSpendWrite=async()=>null;
  expect(json(await f.handler({confirm:true},f.ctx)).code).toBe('refused_by_guard');
  expect(f.calls).toHaveLength(0);
 });
 it('refuses missing owner-confirmed self identity',async()=>{
  await expect(createProjectWriteContext({connection:{neonOrg:IDS.org},
   db:{},env:{VERCEL_ENV:'production'}})).rejects.toThrow(/own Neon project/);
 });
 it('requires evidence for app ownership and never assumes unknown means safe',async()=>{
  const db={getSpendPolicy:async()=>({perChangeCents:2500,perDayCents:5000}),
   getPricing:async()=>({}),getProjectAppOwnership:async()=>({verified:true,appOwned:true})};
  const env={VERCEL_ENV:'production',NEON_MCP_SELF_ORG_ID:IDS.org,
   NEON_MCP_SELF_PROJECT_ID:'proj-fake-self',NEON_MCP_SELF_ENDPOINT_HOST:'localhost',
   DATABASE_URL:'postgresql://fake:fake@localhost/db'};
  const ctx=await createProjectWriteContext({connection:{neonOrg:IDS.org,profile:'full'},db,env});
  const target={target:'project:'+IDS.project,projectId:IDS.project};
  expect(await ctx.guards.checkApp(target,ctx,{})).toBe(false);
  expect(await ctx.guards.checkApp(target,ctx,{outsideApp:true})).toBe(true);
  expect(await ctx.guards.checkApp({target:'project:create:'+IDS.org},ctx,{})).toBe(true);
  delete db.getProjectAppOwnership;
  expect(await ctx.guards.checkApp(target,ctx,{outsideApp:true})).toBe(false);
 });
});
