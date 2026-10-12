import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,role,database,devEndpoint,responses} from '../../test/helpers/neon-fixtures.js';
import {tools,createReadOnlyRoleHandlers} from '../../src/tools/role-read-only.js';
const json=r=>JSON.parse(r.content[0].text);
const args={branchId:IDS.dev,name:'scoped_reader',ownerName:'neondb_owner',
  databaseName:'neondb',endpointId:IDS.devEndpoint,schemas:['public']};
function setup({allowed=true,grantFails=false,profile='full',wrongOwner=false,readOnlyEndpoint=false}={}){
  const fake=makeFakeNeon(),audit=[],saved=[],granted=[];
  const client=makeNeonClient({key:'napi_FAKE_role_read_only',orgId:IDS.org,
    fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
  const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
    mode:'preview',profile},db:{
      recordWritePreview:async x=>audit.push(x),
      reserveWrite:async x=>{audit.push(x);return {created:true,id:audit.length}},
      completeWrite:async x=>audit.push(x),
      saveOneTimeSecret:async x=>saved.push(x),
      consumeSecretRequest:async()=>null
    },env:{PUBLIC_BASE_URL:'https://fake-owner.invalid',
      TOKEN_ENCRYPTION_KEY:'A'.repeat(43)},
    deploymentEnv:'production',clientFor:async()=>client,
    writeKey:()=> 'rmcp_role_read_only_123456789',
    guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
      checkProduction:async()=>({allowed,production:false}),
      checkSpend:async()=>true}};
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev,
    wrongOwner?{owner_name:'foreign_owner'}:{})});
  fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({current_state:'active',...(readOnlyEndpoint?{type:'read_only'}:{})})});
  fake.when('listProjectBranchRoles').resolves({roles:[role(IDS.dev)]});
  fake.when('getProjectBranchRole').resolves({role:role(IDS.dev)})
    .resolves({role:role(IDS.dev)})
    .resolves({role:role(IDS.dev,{name:args.name})});
  fake.when('createProjectBranchRole').resolves({
    role:role(IDS.dev,{name:args.name,password:'npg_FAKE_read_only_secret'}),
    operations:[]});
  const grant=async(a,c,t)=>{
    granted.push({a,t});
    if(grantFails)throw Error('No authorized SQL grants');
    return {verified:true,role:a.name,owner:a.ownerName,schemas:a.schemas,
      futureTablesForOwnerVerified:true};
  };
  return {fake,audit,saved,granted,ctx,
    handler:createReadOnlyRoleHandlers({contextFor:async()=>ctx,grant,
    admission:async()=>true})
      .neon_role_create_read_only};
}
describe('D-4 verified read-only role and owner-secret handoff',()=>{
  it('is a full-owner, B-1 audited access write with bounded schema arguments',()=>{
    expect(tools[0]).toMatchObject({name:'neon_role_create_read_only',
      writes:true,secret:true,access:true,oneTimeOnly:true});
    expect(tools[0].profiles).toEqual(['full']);
    expect(tools[0].inputSchema.properties.schemas.maxItems).toBe(8);
  });
  it('confirms only when SQL grants are proven and the role is reread',async()=>{
    const f=setup();
    const output=json(await f.handler({...args,confirm:true},{}));
    expect(output.confirmed).toBe(true);
    expect(output.oneTimeSecretLink).toMatch(/^https:\/\/fake-owner.invalid\/api\/neon\/setup\?once=/);
    expect(f.granted).toHaveLength(1);
    expect(f.saved).toHaveLength(1);
    expect(f.saved[0].ciphertext).toMatch(/^v1\./);
    expect(JSON.stringify({output,audit:f.audit})).not.toMatch(/npg_FAKE|postgresql:\/\/|read_only_secret/);
    expect(f.fake.calls.filter(c=>c.method==='POST')).toHaveLength(1);
    f.fake.assertClean();
  });
  it('refuses cross-owner identity, guarded targets and nonowner before any POST',async()=>{
    for(const setting of [{wrongOwner:true},{allowed:false},{profile:'everyday'}]){
      const f=setup(setting);
      expect(json(await f.handler({...args,confirm:true},{})).done).toBe(false);
      expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
      f.fake.assertClean();
    }
  });
  it('refuses a read-only compute without creating a role',async()=>{
    const f=setup({readOnlyEndpoint:true});
    const response=json(await f.handler({...args,confirm:true},{}));
    expect(response.done).toBe(false);
    expect(f.fake.calls.filter(c=>c.method==='POST')).toHaveLength(0);
    f.fake.assertClean();
  });
  it('keeps uncertain SQL grants pending; never exposes a password or claims read-only',async()=>{
    const f=setup({grantFails:true});
    const result=json(await f.handler({...args,confirm:true},{}));
    expect(result.confirmed).toBe('pending');
    expect(result.oneTimeSecretLink).toBeUndefined();
    expect(f.granted).toHaveLength(1);
    expect(f.fake.calls.filter(c=>c.method==='POST')).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('npg_FAKE');
    f.fake.assertClean();
  });
});
