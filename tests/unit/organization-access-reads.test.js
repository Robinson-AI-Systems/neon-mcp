import {describe,it,expect} from 'vitest';
import {createOrganizationAccessReadHandlers,tools} from '../../src/tools/organization-access.js';
const org='org-fake', project='project-fake';
const ownerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const staffId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const list=[
 {member:{id:ownerId,user_id:'user-owner',org_id:org,role:'admin'},user:{email:'owner@example.test'}},
 {member:{id:staffId,user_id:'user-staff',org_id:org,role:'member'},user:{email:'staff@example.test'}}
];
const shares=[{id:'share-1',granted_to_email:'legacy@example.test',
 granted_at:'2026-10-15T01:00:00Z'}];
const projectMembers=[{member_id:ownerId,user_id:'user-owner',org_role:'admin',project_role:'admin',
 effective_project_permission:'ADMIN'},
 {member_id:staffId,user_id:'user-staff',org_role:'member',project_role:'viewer',
 effective_project_permission:'VIEWER'}];
const parse=r=>JSON.parse(r.content[0].text);
function fixture({scoped=false,profile='full',missing=false,foreign=false,badCursor=false}={}){
 const calls=[];let memberPage=0;
 const connection={neonOrg:org,profile,mode:'preview',
  ...(scoped?{projectScope:project}:{})};
 const getClient=async(_ctx,_id,{need}={})=>{
  calls.push({kind:'client',need});
  if(missing){const err=new Error('A verified scoped key is unavailable');
   err.code='NEON_KEY_UNAVAILABLE';throw err;}
  return {client:{fake:true},scope:{org,scoped:scoped?project:null},
   credentialKind:'org'};
 };
 const read=async(_client,operationId,params)=>{
  calls.push({kind:'read',operationId,params});
  switch(operationId){
   case 'getOrganization':return {id:org,name:'Test Org',plan:'launch'};
   case 'getOrganizationMembers':
    memberPage++;return {members:memberPage===1?list:[],
     ...(badCursor?{pagination:{next:'abc'}}:{})};
   case 'getOrganizationInvitations':return {invitations:[{id:'inv-1',
    org_id:foreign?'org-foreign':org,email:'new@example.test',role:'member'}]};
   case 'getProject':return {project:{id:project,org_id:foreign?'org-foreign':org}};
   case 'listProjectPermissions':return {project_permissions:shares};
   case 'listProjectMembers':return {members:projectMembers};
   default:throw Error('Unrecognized operation '+operationId);
  }
 };
 return {calls,connection,read,handlers:createOrganizationAccessReadHandlers({getClient,read})};
}
describe('O-1 organization-scoped discovery',()=>{
 it('registers three owner-only reads with strict input shapes',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_org_list','neon_member_list','neon_access_list']);
  expect(tools.every(t=>t.writes===false&&t.profiles.join()==='full'&&
   t.inputSchema.additionalProperties===false)).toBe(true);
 });
 it('verifies chosen org and returns safe organization metadata',async()=>{
  const f=fixture();
  expect(parse(await f.handlers.neon_org_list({},f))).toEqual({
   organizations:[{id:org,name:'Test Org',plan:'launch'}],scope:'selected_organization'});
  expect(f.calls.filter(x=>x.kind==='read').map(x=>x.operationId)).toEqual(['getOrganization']);
  expect(f.calls[0].need).toBe('org');
 });
 it('gets actual roles, pending invitations and no raw keys',async()=>{
  const f=fixture();
  const result=parse(await f.handlers.neon_member_list({includeInvitations:true},f));
  expect(result.members).toEqual([
   {id:ownerId,userId:'user-owner',role:'admin',joinedAt:null,email:'owner@example.test'},
   {id:staffId,userId:'user-staff',role:'member',joinedAt:null,email:'staff@example.test'}
  ]);
  expect(result.invitations[0]).toMatchObject({email:'new@example.test',role:'member'});
  expect(JSON.stringify(result)).not.toContain('key_enc');
 });
 it('distinguishes true project roles from deprecated legacy sharing and matches ownership',async()=>{
  const f=fixture();
  const result=parse(await f.handlers.neon_access_list({projectId:project},f));
  expect(result.projectId).toBe(project);
  expect(result.legacyShares).toEqual([{
   id:'share-1',email:'legacy@example.test',grantedAt:'2026-10-15T01:00:00Z',role:null
  }]);
  expect(result.projectMemberRoles[1]).toMatchObject({
   memberId:staffId,projectRole:'viewer',effectivePermission:'VIEWER'
  });
  expect(f.calls.filter(c=>c.operationId==='listProjectMembers')).toHaveLength(1);
 });
 it('fails closed on project-scoped connection, lower profiles, missing org key and foreign data',async()=>{
  for(const cfg of [{scoped:true},{profile:'read_only'},{profile:'everyday'},
    {missing:true},{foreign:true}]){
   const f=fixture(cfg);
   await expect(f.handlers.neon_access_list({projectId:project},f)).rejects.toThrow();
   expect(f.calls.some(c=>c.operationId==='listProjectMembers')).toBe(false);
  }
  const f=fixture({missing:true});
  await expect(f.handlers.neon_org_list({},f)).rejects.toThrow(/organization API key.*setup page/);
 });
 it('denies malformed, duplicate and unbounded membership evidence',async()=>{
  const f=fixture({badCursor:true});
  await expect(f.handlers.neon_member_list({limit:2},f)).resolves.toMatchObject({content:[{type:'text'}]});
  const loop=fixture({badCursor:true});
  await expect(loop.handlers.neon_member_list({limit:3},loop)).rejects.toThrow(/pagination/);
  const huge=fixture();
  await expect(huge.handlers.neon_member_list({limit:501},huge)).rejects.toThrow(/limit/);
 });
});
