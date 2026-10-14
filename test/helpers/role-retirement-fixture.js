import {createRoleDeleteHandlers} from '../../src/tools/role-delete.js';
import {makeFakeNeon} from './fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,role,responses,AT} from './neon-fixtures.js';
export const a={branchId:IDS.dev,roleName:'unused_reader',monitorRole:'neondb_owner',monitorDatabase:'neondb'};
export const json=r=>JSON.parse(r.content[0].text);
export function fixture({allowed=true,afterAbsent=true,sessions=0,owned=0,production=false,deleteStatus=200}={}){
 const fake=makeFakeNeon(),log=[],previews=new Map();
 const client=makeNeonClient({key:'napi_FAKE_role_retire',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
 const existing=role(IDS.dev,{name:a.roleName,updated_at:AT});
 fake.when('listProjectBranchRoles').resolves({roles:[role(IDS.dev)]});
 fake.when('deleteProjectBranchRole').resolves(deleteStatus===204?undefined:{role:existing,operations:[]}, {status:deleteStatus});
 const db={recordWritePreview:async x=>log.push({kind:'preview',...x}),
  recordRoleRetirementPreview:async x=>{previews.set(x.tokenHash,x);return 1;},
  consumeRoleRetirementPreview:async x=>{
   const p=previews.get(x.tokenHash);
   if(!p||p.connectionId!==x.connectionId||p.identityHash!==x.identityHash)return null;
   previews.delete(x.tokenHash);return {id:1};
  },
  reserveWrite:async x=>{const old=log.find(y=>y.requestKey===x.requestKey);
   if(old)return {created:false,existing:{neon_org:old.orgId,tool:old.tool,
    project_id:old.projectId,branch_id:old.branchId,target:old.target,confirmed:old.confirmed}};
   log.push({kind:'write',...x});return {created:true,id:log.length};},
  completeWrite:async x=>Object.assign(log[x.id-1],x)};
 const c={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'full',mode:'preview',clientId:'client-fake-1'},
  connectionId:'client-fake-1',db,clientFor:async()=>client,writeKey:()=> 'rmcp_role_retire_12345678',
  deploymentEnv:'production',guards:{checkProtected:async()=>allowed,
   checkApp:async()=>allowed,checkProduction:async()=>({allowed,production}),checkSpend:async()=>true}};
 let inspections=0;
 const report={verified:true,projectId:IDS.project,branchId:IDS.dev,roleName:a.roleName,
  roleRevision:AT,poolerClientsVerified:false,
  totals:{roleMemberships:1},computes:[{endpointId:IDS.devEndpoint,host:'ep-fake.neon.invalid',
   type:'read_write',roleOid:181,clear:false,
   totals:{objectReferences:owned,databaseOwnerships:0,activeSessions:sessions,roleMemberships:1},
   memberships:[{granted_role:'neon_superuser',member_role:a.roleName,admin_option:false}]}]};
 const h=createRoleDeleteHandlers({contextFor:async()=>c,inspect:async()=>{inspections++;return structuredClone(report);}});
 // Independently read back absence only after the exact provider DELETE.
 const arrangeReadback=args=>{
  if(args.confirm===true&&args.dryRun!==true){
   const reads=fake.when('getProjectBranchRole').resolves({role:existing});
   if(afterAbsent)reads.rejects(404);
   else reads.resolves({role:existing});
  }
 };
 const invoke=async args=>{arrangeReadback(args);return h.neon_role_delete(args,{});};
 return {c,log,previews,report,fake,invoke,arrangeReadback,handler:h.neon_role_delete,get inspections(){return inspections;}};
}
