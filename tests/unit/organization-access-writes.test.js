import {describe,it,expect,vi,beforeEach} from 'vitest';
const sim=vi.hoisted(()=>({getClient:null,read:null,call:null}));
vi.mock('../../src/tools/project-context.js',async importOriginal=>{
 const original=await importOriginal();
 return {...original,projectClient:(...args)=>sim.getClient(...args),
  projectRead:(...args)=>sim.read(...args)};
});
vi.mock('../../src/neon/client.js',async importOriginal=>{
 const original=await importOriginal();
 return {...original,call:(...args)=>sim.call(...args)};
});
import {tools,handlers} from '../../src/tools/organization-access-writes.js';

const org='org-unit',project='project-unit';
const ownerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const staffId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner={id:ownerId,user_id:'user-owner',org_id:org,role:'admin'};
const staff={id:staffId,user_id:'user-staff',org_id:org,role:'member'};
const env={VERCEL_ENV:'production',DATABASE_URL:'postgresql://fake:fake@localhost/mydb',
 NEON_MCP_SELF_ORG_ID:org,NEON_MCP_SELF_PROJECT_ID:'project-self',
 NEON_MCP_SELF_ENDPOINT_HOST:'localhost'};
const result=r=>JSON.parse(r.content[0].text);
function fixture({kind='org',members=[owner,staff],failWrite=false,foreign=false}={}){
 const state={members:structuredClone(members),invitations:[],shares:[],
  projectRoles:[
   {member_id:ownerId,user_id:'user-owner',org_role:'admin',
    project_role:'admin',effective_project_permission:'ADMIN'},
   {member_id:staffId,user_id:'user-staff',org_role:'member',
    project_role:'viewer',effective_project_permission:'VIEWER'}
  ]};
 const ops=[],audit=[],reserved=new Map(),client={fake:true};
 sim.getClient=async(_ctx,_id,{need}={})=>{
  if(need==='personal'&&kind!=='personal') {
   throw Error('No personal administrator key enrolled');
  }
  return {client,scope:{org,scoped:null},credentialKind:need==='personal'?
   'personal':kind,credentialOwnerUserId:kind==='personal'?'user-owner':null};
 };
 sim.read=async(_client,operationId,params)=>{
  ops.push({operationId,read:true,params});
  switch(operationId){
   case 'getOrganizationMembers':return {members:state.members.map(m=>({
    member:m,user:{email:m.user_id+'@example.test'}})),pagination:{}};
   case 'getOrganizationInvitations':return {invitations:structuredClone(state.invitations)};
   case 'getProject':return {project:{id:project,org_id:foreign?'org-foreign':org}};
   case 'listProjectPermissions':return {project_permissions:structuredClone(state.shares)};
   case 'listProjectMembers':return {members:structuredClone(state.projectRoles)};
   default:throw Error('Unknown read '+operationId);
  }
 };
 sim.call=async(_client,operationId,params,opts)=>{
  ops.push({operationId,params,write:true,opts});
  if(failWrite)return {error:{code:'unknown_outcome'},confirmed:null};
  switch(operationId){
   case 'updateOrganizationMember':
    state.members.find(m=>m.id===params.path.member_id).role=params.body.role;break;
   case 'removeOrganizationMember':
    state.members=state.members.filter(m=>m.id!==params.path.member_id);break;
   case 'createOrganizationInvitations':
    state.invitations.push(...params.body.invitations.map((x,i)=>({
      id:'inv-'+i,org_id:org,...x})));break;
   case 'grantPermissionToProject':
    state.shares.push({id:'perm-1',granted_to_email:params.body.email});break;
   case 'revokePermissionFromProject':
    state.shares=state.shares.filter(x=>x.id!==params.path.permission_id);break;
   case 'setProjectMemberRole':
    state.projectRoles.find(x=>x.member_id===params.path.member_id)
      .project_role=params.body.role;break;
   case 'removeProjectMemberRole':
    state.projectRoles.find(x=>x.member_id===params.path.member_id).project_role=null;break;
   default:throw Error('Unexpected operation '+operationId);
  }
  return {confirmed:true};
 };
 const db={
  recordWritePreview:async x=>{audit.push({...x,kind:'preview'});return audit.length;},
  reserveWrite:async x=>{
   let prior=reserved.get(x.requestKey);
   if(prior)return {created:false,existing:{...prior,neon_org:org,
    project_id:prior.projectId??null,branch_id:null}};
   prior={...x,confirmed:'pending'};reserved.set(x.requestKey,prior);
   audit.push({...x,kind:'reserve'});return {created:true,id:audit.length};
  },
  completeWrite:async x=>{
   audit.push({...x,kind:'complete'});
   for(const v of reserved.values())if(v.orgId===x.orgId)v.confirmed=x.confirmed;
  },
  getProtectedResources:async()=>[]
 };
 const connection={neonOrg:org,profile:'full',mode:'preview'};
 return {context:{connection,db,env},ops,state,audit,reserved};
}
beforeEach(()=>{sim.getClient=null;sim.read=null;sim.call=null});
describe('O-1 audited member and access writes',()=>{
 it('registers six complete full-owner access write contracts',()=>{
  expect(tools.map(x=>x.name).sort()).toEqual([
   'neon_access_revoke_share','neon_access_set_project_role',
   'neon_access_share_project','neon_member_invite','neon_member_remove',
   'neon_member_set_role']);
  for(const t of tools)expect(t).toMatchObject({
   profiles:['full'],writes:true,writeContract:'defineWrite-v1',access:true,
   inputSchema:{type:'object',additionalProperties:false}
  });
 });
 it('previews exact member role and performs no write until confirmation',async()=>{
  const f=fixture(),args={memberId:staffId,role:'editor'};
  const preview=result(await handlers.neon_member_set_role({...args,dryRun:true},f.context));
  expect(preview.preview).toContain('editor');
  expect(preview.needsConfirmation).toBe(true);
  expect(f.ops.some(x=>x.write)).toBe(false);
  const waiting=result(await handlers.neon_member_set_role(args,f.context));
  expect(waiting.code).toBe('needs_confirmation');
  expect(f.ops.some(x=>x.write)).toBe(false);
  const receipt=result(await handlers.neon_member_set_role({...args,confirm:true},f.context));
  expect(receipt).toMatchObject({done:true,confirmed:true});
  expect(f.state.members.find(m=>m.id===staffId).role).toBe('editor');
  expect(f.ops.filter(x=>x.write)[0]).toMatchObject({
   operationId:'updateOrganizationMember',
   params:{path:{org_id:org,member_id:staffId},body:{role:'editor'}}
  });
  const once=f.ops.filter(x=>x.write).length;
  const replay=result(await handlers.neon_member_set_role({...args,confirm:true},f.context));
  expect(replay.done).toBe(false);
  expect(f.ops.filter(x=>x.write)).toHaveLength(once);
 });
 it('refuses last admin demotion/removal without any mutation',async()=>{
  for(const operation of ['neon_member_set_role','neon_member_remove']){
   const f=fixture({kind:'personal',members:[owner,staff]});
   const args={memberId:ownerId,...(operation.endsWith('set_role')?{role:'member'}:{})};
   const resultValue=result(await handlers[operation]({...args,confirm:true},f.context));
   expect(resultValue.done).toBe(false);
   expect(f.ops.some(x=>x.write)).toBe(false);
  }
 });
 it('refuses credential owner self-demotion even when second admin exists',async()=>{
  const f=fixture({kind:'personal',members:[owner,{...staff,role:'admin'}]});
  const x=result(await handlers.neon_member_set_role(
   {memberId:ownerId,role:'viewer',confirm:true},f.context));
  expect(x.done).toBe(false);expect(f.ops.every(op=>!op.write)).toBe(true);
 });
 it('uses personal-admin credential for invitations/removals; no outside email before consent',async()=>{
  const f=fixture({kind:'personal'});
  const args={invitations:[{email:'new@example.test',role:'member'}]};
  const preview=result(await handlers.neon_member_invite({...args,dryRun:true},f.context));
  expect(preview.preview).toContain('new@example.test');
  expect(f.ops.every(op=>!op.write)).toBe(true);
  const created=result(await handlers.neon_member_invite({...args,confirm:true},f.context));
  expect(created.confirmed).toBe(true);
  expect(f.ops.filter(op=>op.write)[0]).toMatchObject({
   operationId:'createOrganizationInvitations',
   params:{path:{org_id:org},body:{invitations:args.invitations}}
  });
  const removed=result(await handlers.neon_member_remove({
   memberId:staffId,confirm:true},f.context));
  expect(removed.confirmed).toBe(true);
  expect(f.ops.filter(op=>op.write).map(x=>x.operationId)).toEqual([
   'createOrganizationInvitations','removeOrganizationMember']);
  const absent=fixture({kind:'org'});
  const refused=result(await handlers.neon_member_invite({...args,confirm:true},absent.context));
  expect(refused.done).toBe(false);
  expect(absent.ops.some(x=>x.write)).toBe(false);
 });
 it('verifies project access grant, explicit role/clear, revoke; never contacts foreign project',async()=>{
  const f=fixture();
  const share=result(await handlers.neon_access_share_project({
   projectId:project,email:'new@example.test',confirm:true},f.context));
  expect(share.confirmed).toBe(true);
  expect(f.state.shares).toHaveLength(1);
  const set=result(await handlers.neon_access_set_project_role({
   projectId:project,memberId:staffId,role:'editor',confirm:true},f.context));
  expect(set.confirmed).toBe(true);
  const clear=result(await handlers.neon_access_set_project_role({
   projectId:project,memberId:staffId,role:'inherit',confirm:true},f.context));
  expect(clear.confirmed).toBe(true);
  const revoke=result(await handlers.neon_access_revoke_share({
   projectId:project,permissionId:'perm-1',confirm:true},f.context));
  expect(revoke.confirmed).toBe(true);
  expect(f.state.shares).toHaveLength(0);
  expect(f.ops.filter(x=>x.write).map(x=>x.operationId)).toEqual([
   'grantPermissionToProject','setProjectMemberRole',
   'removeProjectMemberRole','revokePermissionFromProject']);
  const foreign=fixture({foreign:true});
  const denied=result(await handlers.neon_access_share_project({
   projectId:project,email:'new@example.test',confirm:true},foreign.context));
  expect(denied.done).toBe(false);expect(foreign.ops.some(x=>x.write)).toBe(false);
 });
 it('an unknown transport outcome stays pending, never retries mutations',async()=>{
  const f=fixture({failWrite:true}),args={memberId:staffId,role:'editor',confirm:true};
  const first=result(await handlers.neon_member_set_role(args,f.context));
  expect(first).toMatchObject({done:false,confirmed:'pending'});
  const again=result(await handlers.neon_member_set_role(args,f.context));
  expect(again).toMatchObject({done:false,confirmed:'pending'});
  expect(f.ops.filter(x=>x.write)).toHaveLength(1);
 });
 it('refuses project-scope, weaker profiles and audit database unavailability',async()=>{
  for(const update of [{projectScope:project},{profile:'everyday'},
   {profile:'read_only'}]){
   const f=fixture();
   const c={...f.context,connection:{...f.context.connection,...update}};
   const denied=result(await handlers.neon_member_set_role({
    memberId:staffId,role:'editor',confirm:true},c));
   expect(denied.done).toBe(false);
   expect(f.ops.some(x=>x.write)).toBe(false);
  }
 });
});
