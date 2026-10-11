import { describe,expect,it } from 'vitest';
import { makeContractFixture,runWriteContract } from '../../test/helpers/write-contract.js';
import { defineWrite } from '../../src/core/write.js';

describe('B-1 shared guarded write contract',()=>{
  it('meets nine lifecycle and refusal checks against isolated samples',async()=>{
    await runWriteContract();
  });
  it('fails closed when any safety service or audit capability is unavailable',async()=>{
    const f=makeContractFixture();
    delete f.ctx.guards.checkProtected;
    expect(f.parse(await f.handler({confirm:true},f.ctx)).code).toBe('refused_by_guard');
    expect(f.calls).toHaveLength(0);
    const g=makeContractFixture();
    delete g.ctx.db.reserveWrite;
    expect(g.parse(await g.handler({confirm:true},g.ctx)).code).toBe('refused_by_guard');
    expect(g.calls).toHaveLength(0);
  });
  it('rejects preview deployments trying to use production mode',async()=>{
    const f=makeContractFixture({production:true});
    f.ctx.connection.mode='production';
    f.ctx.deploymentEnv='preview';
    expect(f.parse(await f.handler({confirm:true},f.ctx)).code).toBe('refused_by_guard');
  });
  it('never logs or exposes raw before, after, or unsafe inverse arguments',async()=>{
    const f=makeContractFixture();
    const result=f.parse(await f.handler({confirm:true},f.ctx));
    expect(result.confirmed).toBe(true);
    expect(f.log[0].inverse).toEqual({tool:'neon_undo_sample',args:{branch_id:'br-fake'}});
    expect(JSON.stringify(f.log)).not.toContain('updated');
  });
  it('refuses an idempotency key reused for a different target in the same organization',async()=>{
    const f=makeContractFixture();
    expect(f.parse(await f.handler({confirm:true},f.ctx)).done).toBe(true);
    const prior=f.log[0];
    prior.target='br-another';
    expect(f.parse(await f.handler({confirm:true},f.ctx)).code).toBe('refused_by_guard');
    expect(f.calls).toHaveLength(1);
  });
  it('requires a valid tool contract before defining the handler',()=>{
    expect(()=>defineWrite({name:'no'})).toThrow();
  });
});
