// Shared nine-case acceptance runner. Apply functions are deliberately fake, not live Neon.
import { expect } from 'vitest';
import { defineWrite } from '../../src/core/write.js';

const parse = result => JSON.parse(result.content[0].text);
export function makeContractFixture({ production = false, spendCents = null,
  blocked = false, appOwned = false, verify = true } = {}) {
  const log = [], calls = [];
  const db = {
    async recordWritePreview(row) { log.push({ kind:'preview', ...row }); return log.length; },
    async reserveWrite(row) {
      const existing = log.find(x => x.kind==='reserved' && x.requestKey===row.requestKey);
      if (existing) return { created:false, existing:{neon_org:existing.orgId,
        tool:existing.tool, project_id:existing.projectId,
        branch_id:existing.branchId, target:existing.target, confirmed:existing.confirmed} };
      log.push({kind:'reserved',...row,confirmed:'pending'});
      return {created:true,id:log.length};
    },
    async completeWrite(row) {
      const existing=log[row.id-1];
      if (existing?.confirmed!=='pending') return false;
      Object.assign(existing,row);
      return true;
    }
  };
  const guards = {
    checkProtected: async()=>!blocked,
    checkApp: async()=>!appOwned,
    checkProduction: async()=>({allowed:true,production}),
    checkSpend: async(est)=>!est || est.increaseCents<=2500
  };
  const connection={neon_org:'org-fake',project_scope:'prj-fake',
    mode:'preview',profile:'everyday'};
  const ctx={connection,db,guards,deploymentEnv:'production',
    writeKey:()=> 'rmcp_sample_write_abcdef123456',
    reserveSpendWrite:async ({write})=>db.reserveWrite(write)};
  const {tool,handler}=defineWrite({name:'neon_sample_write',
    plan:async()=>({before:{id:'br-fake'},target:'br-fake',projectId:'prj-fake',
      summary:'Update disposable branch metadata'}),
    apply:async()=>{calls.push('apply');return {confirmed:true,operations:[{id:'op-fake'}]};},
    readAfter:async()=>({id:'br-fake',updated:true}),
    verify:async()=>verify,
    spend:spendCents==null?null:async()=>({increaseCents:spendCents}),
    inverse:async()=>({tool:'neon_undo_sample',args:{branch_id:'br-fake'}})
  });
  return {tool,handler,ctx,log,calls,parse};
}
export async function runWriteContract(make = makeContractFixture, {input = {}, expectedSpendCents = 100} = {}) {
  const f=make();
  expect(f.tool.writes).toBe(true);
  expect(f.tool.writeContract).toBe('defineWrite-v1');
  expect(f.parse(await f.handler({...input,dryRun:true},f.ctx)).done).toBe(false);
  expect(f.calls).toHaveLength(0); // 1 dry run never writes
  expect(f.log[0].kind).toBe('preview');
  expect(f.parse(await f.handler(input,f.ctx)).code).toBe('needs_confirmation'); // 2
  expect(f.calls).toHaveLength(0);
  const one=f.parse(await f.handler({...input,confirm:true},f.ctx));
  expect(one.confirmed).toBe(true); // 3
  expect(f.calls).toHaveLength(1);
  expect(f.log[1].confirmed).toBe('true');
  expect(f.log[1].requestKey).toMatch(/^rmcp_/);
  const again=f.parse(await f.handler({...input,confirm:true},f.ctx));
  expect(again.done).toBe(true);
  expect(f.calls).toHaveLength(1); // 3 duplicate
  const missing=make({verify:false});
  expect(missing.parse(await missing.handler({...input,confirm:true},missing.ctx)).confirmed).toBe(false); // 4
  const prod=make({production:true});
  expect(prod.parse(await prod.handler({...input,confirm:true},prod.ctx)).code).toBe('refused_by_guard'); // 5
  expect(prod.calls).toHaveLength(0);
  prod.ctx.connection.mode='production';
  expect(prod.parse(await prod.handler({...input,confirm:true},prod.ctx)).confirmed).toBe(true);
  const blocked=make({blocked:true});
  expect(blocked.parse(await blocked.handler({...input,confirm:true},blocked.ctx)).code).toBe('refused_by_guard'); // 6
  expect(blocked.calls).toHaveLength(0);
  const high=make({spendCents:2600});
  expect(high.parse(await high.handler({...input,confirm:true},high.ctx)).code).toBe('refused_by_guard'); // 7
  const price=make({spendCents:100});
  const quoted=price.parse(await price.handler({...input,dryRun:true},price.ctx)).spendMonthCents;
  if(expectedSpendCents===null)expect(quoted).toBeGreaterThanOrEqual(0);
  else expect(quoted).toBe(expectedSpendCents);
  const app=make({appOwned:true});
  expect(app.parse(await app.handler({...input,confirm:true},app.ctx)).code).toBe('refused_by_guard'); // 8
  const secret=make();
  secret.ctx.writeKey=()=> 'rmcp_secret_sample_abc123';
  expect(JSON.stringify(secret.parse(await secret.handler({...input,confirm:true},secret.ctx))))
    .not.toMatch(/napi_|postgresql:\/\//i); // 9 safe output
  expect(JSON.stringify(secret.log)).not.toMatch(/napi_|postgresql:\/\//i);
}
