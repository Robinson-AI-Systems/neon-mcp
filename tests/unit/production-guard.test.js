import {expect,it,describe} from 'vitest';
import {classifyTarget,checkProductionAccess} from '../../src/neon/production.js';
import {mergeWithSelf,protectsTarget,checkProtectedTarget,validateProtectedResources}
  from '../../src/core/protected-resources.js';
const base={projectId:'prj-fake',branchId:'br-fake'};
const branch=overrides=>({id:'br-fake',default:false,protected:false,...overrides});
const ctx=(data,profile)=>({getBranch:async()=>data,getProfile:async()=>profile});
describe('production classification requires actual Neon branch state',()=>{
  it('classifies default and protected branches, not deprecated primary',async()=>{
    for(const row of [branch({default:true}),branch({protected:true})])
      expect((await classifyTarget(ctx(row),base)).production).toBe(true);
    expect((await classifyTarget(ctx(branch({primary:true,default:false})),base)).production).toBe(false);
    expect((await classifyTarget(ctx(branch({primary:false,default:true})),base)).production).toBe(true);
  });
  it('classifies child branches and their computes/databases from their actual branch',async()=>{
    expect((await classifyTarget(ctx(branch()),base)).production).toBe(false);
    expect((await classifyTarget(ctx(branch({protected:true})),{
      ...base, kind:'compute' })).production).toBe(true);
    expect((await classifyTarget(ctx(branch({default:true})),{
      ...base, kind:'database' })).production).toBe(true);
  });
  it('always guards project-wide writes and known profiled/shared preview branches',async()=>{
    expect((await classifyTarget({}, {projectId:'prj-fake',projectWide:true})).production).toBe(true);
    const p={productionBranches:['br-fake'],sharedPreviewBranches:[]};
    expect((await classifyTarget(ctx(branch(),p),base)).kind).toBe('profile_production');
    const shared=await classifyTarget(ctx(branch(),{sharedPreviewBranches:['br-fake']}),base);
    expect(shared.production).toBe(true);
    expect(shared.sharedPreview).toBe(true);
  });
  it('fails closed on missing identity or unavailable readback',async()=>{
    expect((await classifyTarget({},base)).allowed).toBe(false);
    expect((await classifyTarget(ctx({id:'br-wrong'}),base)).allowed).toBe(false);
    expect((await classifyTarget({getBranch:async()=>{throw Error('offline');}},base)).allowed).toBe(false);
  });
  it('preview-mode and unapproved owner production access always deny',async()=>{
    const conf={...ctx(branch({default:true})),connection:{neonOrg:'org-fake',mode:'preview'},
      deploymentEnv:'production',db:{getNeonOrg:async()=>({production_enabled:true})}};
    expect((await checkProductionAccess(base,conf,{productionEffect:'write'})).allowed).toBe(false);
    conf.connection.mode='production';
    conf.deploymentEnv='preview';
    expect((await checkProductionAccess(base,conf,{productionEffect:'write'})).allowed).toBe(false);
    conf.deploymentEnv='production';conf.db.getNeonOrg=async()=>({production_enabled:false});
    expect((await checkProductionAccess(base,conf,{productionEffect:'write'})).allowed).toBe(false);
    conf.db.getNeonOrg=async()=>({production_enabled:true});
    expect((await checkProductionAccess(base,conf,{productionEffect:'write'})).allowed).toBe(true);
    expect((await checkProductionAccess(base,conf,{productionEffect:'none'})).production).toBe(false);
  });
});
describe('permanent protected-resource guard',()=>{
  const self={org:'org-fake',project_id:'prj-self'};
  const other={kind:'robinson',org:'org-fake',project_id:'prj-other',label:'Another server'};
  it('inserts self automatically and never permits it to be removed',()=>{
    const items=mergeWithSelf([other,{...other,kind:'self',project_id:'prj-self'}],self);
    expect(items[0].kind).toBe('self');
    expect(items[0].project_id).toBe('prj-self');
    expect(protectsTarget(items,{org:'org-fake',projectId:'prj-self'})).toBe(true);
    expect(protectsTarget(items,{org:'org-fake',projectId:'prj-other',branchId:'br-any'})).toBe(true);
    expect(protectsTarget(items,{org:'org-fake',projectId:'prj-scratch'})).toBe(false);
  });
  it('supports branch-only restrictions and refuses invalid or duplicate entries',()=>{
    const items=validateProtectedResources([{kind:'other',org:'org-fake',
      project_id:'prj-scratch',branch_id:'br-main',label:'Protected branch'}]);
    expect(protectsTarget(items,{org:'org-fake',projectId:'prj-scratch',branchId:'br-main'})).toBe(true);
    expect(protectsTarget(items,{org:'org-fake',projectId:'prj-scratch',branchId:'br-child'})).toBe(false);
    expect(()=>validateProtectedResources([other,other])).toThrow();
    expect(()=>mergeWithSelf([],null)).toThrow();
  });
  it('fails closed without verified self, owner storage or identity',async()=>{
    expect(await checkProtectedTarget(base,{})).toBe(false);
    const good={connection:{neonOrg:'org-fake'},selfProject:self,
      db:{getProtectedResources:async()=>[other]}};
    expect(await checkProtectedTarget({projectId:'prj-other'},good)).toBe(false);
    expect(await checkProtectedTarget({projectId:'prj-scratch'},good)).toBe(true);
    good.db.getProtectedResources=async()=>{throw Error('offline');};
    expect(await checkProtectedTarget({projectId:'prj-scratch'},good)).toBe(false);
  });
});
