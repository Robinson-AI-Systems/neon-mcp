import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,role,database,devEndpoint,responses} from '../../test/helpers/neon-fixtures.js';
import {inspectRoleDeleteReadiness} from '../../src/tools/role-delete-inventory.js';
const choice={branchId:IDS.dev,roleName:'unused_reader',
  monitorDatabase:'neondb',monitorRole:'neondb_owner'};
const cleared={verified:true,role:'unused_reader',clear:true,
  totals:{objectReferences:0,databaseOwnerships:0,roleMemberships:0,activeSessions:0},
  visibility:'global_role_references_and_complete_compute_sessions'};
function setup({blocked=false,pooler=false,unknown=false,sessions=0,
  profile='full',rereadType='read_write'}={}){
  const fake=makeFakeNeon(),inspected=[];
  const client=makeNeonClient({key:'napi_FAKE_delete_inventory',orgId:IDS.org,
    fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
  const e=devEndpoint({current_state:'active',pooler_enabled:pooler});
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('getProjectBranchRole').resolves({role:role(IDS.dev,{name:'unused_reader'})})
    .resolves({role:role(IDS.dev)});
  fake.when('listProjectEndpoints').resolves({endpoints:[e]});
  fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.dev)]});
  fake.when('listProjectBranchRoles').resolves({roles:[
    role(IDS.dev,{name:'unused_reader'}),role(IDS.dev)]});
  fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev)});
  fake.when('getProjectEndpoint').resolves({endpoint:{...e,type:rereadType}});
  const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
    profile,mode:'preview'},
    db:{getProtectedResources:async()=>[],getSqlReadPolicy:async()=>
      ({productionReads:true,maxRows:50})},
    selfProject:{org:IDS.org,project_id:'proj-self-fake'},
    getBranch:async()=>({id:IDS.dev,default:false,protected:false}),
    clientFor:async()=>client,
    guards:{checkApp:async()=>!blocked,
      checkProduction:async()=>({allowed:!blocked,production:false})}};
  const inspectEndpoint=async(a,c,t,endpoint)=>{
    inspected.push(endpoint.id);
    return unknown?{verified:false}:{...cleared,clear:sessions===0,
      totals:{...cleared.totals,activeSessions:sessions}};
  };
  return {fake,ctx,inspected,inspectEndpoint};
}
describe('D-4 complete scoped role-deletion compute inventory',()=>{
  it('verifies each compute and returns exact zero dependency counts',async()=>{
    const f=setup();
    const data=await inspectRoleDeleteReadiness(choice,f.ctx,{inspectEndpoint:f.inspectEndpoint});
    expect(data).toMatchObject({verified:true,clear:false,
      postgresDependenciesClear:true,poolerClientsVerified:false,
      computeIds:[IDS.devEndpoint],roleName:'unused_reader'});
    expect(f.inspected).toEqual([IDS.devEndpoint]);
    expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
    f.fake.assertClean();
  });
  it('rejects compute role changes between listing and endpoint reread before SQL',async()=>{
    const f=setup({rereadType:'read_only'});
    await expect(inspectRoleDeleteReadiness(choice,f.ctx,
      {inspectEndpoint:f.inspectEndpoint})).rejects.toThrow(/identity or state changed/);
    expect(f.inspected).toEqual([]);
    expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
    f.fake.assertClean();
  });
  it('retains dependent sessions as blockers without claiming safe deletion',async()=>{
    const f=setup({sessions:4});
    const data=await inspectRoleDeleteReadiness(choice,f.ctx,{inspectEndpoint:f.inspectEndpoint});
    expect(data.clear).toBe(false);
    expect(data.totals.activeSessions).toBe(4);
    expect(data.postgresDependenciesClear).toBe(false);
    f.fake.assertClean();
  });
  it('refuses pooler aliases, unknown session inventory and owner/app denial before SQL',async()=>{
    for(const settings of [{pooler:true},{unknown:true},{blocked:true},{profile:'everyday'}]){
      const f=setup(settings);
      await expect(inspectRoleDeleteReadiness(choice,f.ctx,
        {inspectEndpoint:f.inspectEndpoint})).rejects.toThrow();
      expect(f.inspected).toHaveLength(settings.unknown?1:0);
      expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
      f.fake.assertClean();
    }
  });
});
