// O-1: provider-supported organization membership and legacy access writes.
// Account-level effects use B-1 durable audit/confirmation, not a guessed production flag.
import {defineWrite} from '../core/write.js';
import {call} from '../neon/client.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {projectClient,projectRead,projectScope} from './project-context.js';
import {members,projectRoles} from './organization-access.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const orgId=/^[a-z0-9-]{1,60}$/;
const roles=new Set(['admin','editor','member','viewer','collaborator']);
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const base={dryRun:{type:'boolean'},confirm:{type:'boolean'},outsideApp:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}};
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const uid={type:'string',format:'uuid'};
const emailProp={type:'string',format:'email',maxLength:256};
const roleProp={type:'string',enum:[...roles]};
const profiles=['full'];

function selection(ctx){
 const org=ctx.connection?.neonOrg??ctx.connection?.neon_org;
 if(!orgId.test(org??'')||ctx.connection?.profile!=='full'||
    ctx.connection?.projectScope||ctx.connection?.project_scope)
  throw Error('Full owner organization access required. Enroll an organization or personal admin key on the setup page.');
 return org;
}
async function clientFor(ctx,kind='org'){
 const org=selection(ctx);
 const result=await projectClient(ctx,null,{need:kind});
 if(result.scope.org!==org||result.scope.scoped||(!['org','personal'].includes(result.credentialKind))||
    (kind==='personal'&&(result.credentialKind!=='personal'||!result.credentialOwnerUserId)))
  throw Error('An independently verified '+kind+' organization administrator credential is required');
 return {org,client:result.client,actor:result.credentialOwnerUserId??null};
}
function safeEmail(raw){
 if(typeof raw!=='string'||raw.length>256||!/^\S+@\S+\.\S+$/.test(raw)||
    /[\r\n<>]/.test(raw))throw Error('Invalid invitation or access email');
 return raw.toLowerCase();
}
async function inventory(ctx,kind='org'){
 const {org,client,actor}=await clientFor(ctx,kind);
 const list=await members(client,org,500);
 if(list.capped)throw Error('Membership inventory incomplete; cannot make access changes');
 if(!Array.isArray(list.members)||!list.members.some(m=>m.role==='admin'))
  throw Error('No independently verified organization administrator');
 if(actor){
  const self=list.members.filter(m=>m.userId===actor&&m.role==='admin');
  if(self.length!==1)throw Error('The personal key owner no longer has verified administrator authority');
 }
 return {org,client,actor,list:list.members};
}
async function oneMember(ctx,memberId,kind='org'){
 if(!uuid.test(memberId??''))throw Error('Invalid organization member identifier');
 const i=await inventory(ctx,kind);
 const target=i.list.find(x=>x.id===memberId);
 if(!target)throw Error('Member not found in the selected organization');
 return {...i,target};
}
async function projectAccess(args,ctx){
 const i=await inventory(ctx,'org'),projectId=projectScope(ctx,args.projectId??null).projectId;
 if(!projectId)throw Error('Choose a permitted project');
 const p=(await projectRead(i.client,'getProject',{path:{project_id:projectId}}))?.project;
 if(p?.id!==projectId||p.org_id!==i.org)throw Error('Project identity mismatch');
 const data=await projectRead(i.client,'listProjectPermissions',{path:{project_id:projectId}});
 if(!Array.isArray(data?.project_permissions)||data.project_permissions.length>500)
  throw Error('Project access inventory incomplete');
 const permissions=data.project_permissions.map(x=>{
  const email=x?.granted_to_email??x?.email;
  if(typeof x?.id!=='string'||!x.id||typeof email!=='string')
   throw Error('Unverified project share');
  return {id:x.id,email:safeEmail(email),grantedAt:x.granted_at??null};
 });
 if(new Set(permissions.map(p=>p.id)).size!==permissions.length)
  throw Error('Duplicate project access identifiers');
 const roleRows=await projectRoles(i.client,projectId);
 return {...i,projectId,permissions,roleRows};
}
function guardNoLockout(i,a){
 if(i.actor && i.target?.userId===i.actor)
  throw Error('Cannot alter or remove the credential-owner’s own organization access');
 if(i.target?.role==='admin'&&a!=='admin'&&
    i.list.filter(m=>m.role==='admin').length<=1)
  throw Error('Refusing to demote or remove the last organization administrator');
}
function allEmails(a){
 if(!Array.isArray(a.invitations)||a.invitations.length<1||a.invitations.length>10)
  throw Error('Choose one to ten invitation recipients');
 const seen=new Set();
 return a.invitations.map(x=>{
  const email=safeEmail(x?.email);
  if(!roles.has(x?.role)||seen.has(email))
   throw Error('Invalid or duplicate invitation recipient or role');
  seen.add(email);return {email,role:x.role};
 });
}
async function invites(ctx,kind='personal'){
 const i=await inventory(ctx,kind);
 const data=await projectRead(i.client,'getOrganizationInvitations',{path:{org_id:i.org}});
 if(!Array.isArray(data?.invitations)||data.invitations.length>500)
  throw Error('Cannot verify a complete invitation inventory');
 for(const row of data.invitations)
  if(row.org_id!==i.org||typeof row.email!=='string')throw Error('Foreign invitation');
 return {...i,invites:data.invitations};
}
async function change(operationId,params,ctx,requestKeyValue){
 const client=(await clientFor(ctx,
   ['createOrganizationInvitations','removeOrganizationMember'].includes(operationId)?'personal':'org')).client;
 const result=await call(client,operationId,params,{write:true,requestKey:requestKeyValue});
 if(result.error)return {confirmed:result.error.code==='unknown_outcome'?'pending':false};
 return {confirmed:result.confirmed===true?true:'pending'};
}
async function writeContext(ctx){
 // Project access modifies an entire project's permissions. Delegate B-2,
 // protected-target, app-ownership (including outsideApp), and B-4 guards to
 // the repository's canonical server-owned context. No Boolean stubs.
 selection(ctx);
 const canonical=await createProjectWriteContext(ctx,{keyNeed:'org'});
 const projectGuards=canonical.guards;
 return {...canonical,guards:{
  checkProtected:(target,c)=>target.projectId?
    projectGuards.checkProtected(target,c):true,
  checkProduction:(target,c,tool)=>target.projectId?
    projectGuards.checkProduction(target,c,tool):{allowed:true,production:false},
  checkApp:(target,c,args)=>target.projectId?
    projectGuards.checkApp(target,c,args):true,
  checkSpend:projectGuards.checkSpend
 }};
}
const memberRole=defineWrite({
 name:'neon_member_set_role',key:'org',access:true,productionEffect:'none',
 plan:async(a,c)=>{
  if(!roles.has(a.role))throw Error('Choose an allowed organization role');
  const i=await oneMember(c,a.memberId);
  if(i.target.role===a.role)throw Error('Organization role already assigned');
  guardNoLockout(i,a.role);
  return {target:'org:'+i.org+':member:'+a.memberId,before:i,
    summary:'Change member '+a.memberId+' of '+i.org+' from '+i.target.role+' to '+a.role+
      '. This changes project and organization permissions immediately; verify the resulting access.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await oneMember(c,a.memberId);
  if(now.target.role!==before.target.role||now.target.userId!==before.target.userId)
   throw Error('Member changed after preview');
  guardNoLockout(now,a.role);
  return change('updateOrganizationMember',
   {path:{org_id:before.org,member_id:a.memberId},body:{role:a.role}},c,requestKey);
 },
 readAfter:async(a,c)=>oneMember(c,a.memberId),
 verify:(before,after,a)=>after.org===before.org&&after.target.userId===before.target.userId&&
   after.target.role===a.role
});
const memberRemove=defineWrite({
 name:'neon_member_remove',key:'org',access:true,destructive:true,productionEffect:'none',
 plan:async(a,c)=>{
  const i=await oneMember(c,a.memberId,'personal');
  guardNoLockout(i,'removed');
  return {target:'org:'+i.org+':member:'+a.memberId,before:i,
   summary:'REMOVE member '+a.memberId+' from organization '+i.org+
    ', immediately revoking all organization access. Personal administrator key and owner confirmation required.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await oneMember(c,a.memberId,'personal');
  if(now.target.userId!==before.target.userId||now.target.role!==before.target.role)
   throw Error('Member changed after preview');
  guardNoLockout(now,'removed');
  return change('removeOrganizationMember',
   {path:{org_id:before.org,member_id:a.memberId}},c,requestKey);
 },
 readAfter:async(_a,c)=>inventory(c,'personal'),
 verify:(before,after,a)=>after.org===before.org&&!after.list.some(m=>m.id===a.memberId)
});
const memberInvite=defineWrite({
 name:'neon_member_invite',key:'org',access:true,productionEffect:'none',
 plan:async(a,c)=>{
  const i=await invites(c),wanted=allEmails(a);
  const existing=new Set([...i.list.map(m=>m.email?.toLowerCase()),...i.invites.map(v=>v.email.toLowerCase())]);
  if(wanted.some(v=>existing.has(v.email)))throw Error('One or more people are already invited or members');
  return {target:'org:'+i.org+':invites:'+wanted.map(v=>v.email).sort().join(','),before:i,
   summary:'Invite '+wanted.map(x=>x.email+' as '+x.role).join(', ')+
    ' to '+i.org+'. Neon will send email or automatically add existing users with these roles.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await invites(c);
  const old=new Set([...before.list.map(m=>m.email?.toLowerCase()),...before.invites.map(v=>v.email.toLowerCase())]);
  const fresh=new Set([...now.list.map(m=>m.email?.toLowerCase()),...now.invites.map(v=>v.email.toLowerCase())]);
  if([...old].some(x=>!fresh.has(x))||allEmails(a).some(v=>fresh.has(v.email)))
   throw Error('Membership or invitations changed after preview');
  return change('createOrganizationInvitations',
   {path:{org_id:before.org},body:{invitations:allEmails(a)}},c,requestKey);
 },
 readAfter:async(_a,c)=>invites(c),
 verify:(before,after,a)=>after.org===before.org&&allEmails(a).every(v=>
    after.list.some(m=>m.email?.toLowerCase()===v.email&&m.role===v.role)||
    after.invites.some(i=>i.email.toLowerCase()===v.email&&i.role===v.role))
});
const share=defineWrite({
 name:'neon_access_share_project',key:'org',access:true,projectWide:true,
 productionEffect:'none',
 plan:async(a,c)=>{
  const i=await projectAccess(a,c),email=safeEmail(a.email);
  if(i.permissions.some(p=>p.email===email))throw Error('Project share already exists');
  return {target:'project:'+i.projectId+':share:'+email,projectId:i.projectId,before:i,
   summary:'Grant project '+i.projectId+' legacy collaborator access to '+email+
    '. This may grant database project administration rights; confirm the recipient and scope.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await projectAccess(a,c);
  if(JSON.stringify(now.permissions)!==JSON.stringify(before.permissions))
   throw Error('Project share inventory changed after preview');
  return change('grantPermissionToProject',
   {path:{project_id:before.projectId},body:{email:safeEmail(a.email)}},c,requestKey);
 },
 readAfter:projectAccess,
 verify:(before,after,a)=>after.projectId===before.projectId&&
  after.permissions.some(p=>p.email===safeEmail(a.email))&&
  after.permissions.length===before.permissions.length+1
});
const revokeShare=defineWrite({
 name:'neon_access_revoke_share',key:'org',access:true,destructive:true,
 projectWide:true,productionEffect:'none',
 plan:async(a,c)=>{
  const i=await projectAccess(a,c);
  const p=i.permissions.find(p=>p.id===a.permissionId);
  if(!p)throw Error('Unknown permission identity');
  return {target:'project:'+i.projectId+':share:'+p.id,projectId:i.projectId,before:{...i,share:p},
   summary:'Revoke project '+i.projectId+' access for '+p.email+' (permission '+p.id+
    '). This may immediately disconnect a collaborator or integration.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await projectAccess(a,c);
  const p=now.permissions.find(p=>p.id===a.permissionId);
  if(!p||p.email!==before.share.email||now.permissions.length!==before.permissions.length)
   throw Error('Project share changed after preview');
  return change('revokePermissionFromProject',
   {path:{project_id:before.projectId,permission_id:a.permissionId}},c,requestKey);
 },
 readAfter:projectAccess,
 verify:(before,after,a)=>after.projectId===before.projectId&&
  after.permissions.length===before.permissions.length-1&&
  !after.permissions.some(p=>p.id===a.permissionId)
});


const projectMemberRole=defineWrite({
 name:'neon_access_set_project_role',key:'org',access:true,projectWide:true,
 productionEffect:'none',
 plan:async(a,c)=>{
  if(!['viewer','editor','admin','inherit'].includes(a.role))
   throw Error('Choose viewer, editor, admin or inherit');
  const i=await projectAccess(a,c);
  const member=i.list.find(m=>m.id===a.memberId),row=i.roleRows.find(m=>m.memberId===a.memberId);
  if(!member||!row||row.userId!==member.userId)
   throw Error('Project member identity or current permissions are unverified');
  if(i.actor&&member.userId===i.actor)
   throw Error('Changing the credential owner’s own project access is refused to prevent lockout');
  const next=a.role==='inherit'?null:a.role;
  if(row.projectRole===next)throw Error('Requested explicit project role is already in effect');
  const effect=next?('Set explicit '+next+' access'):
    'Clear explicit access; the inherited organization-role permission remains';
  return {target:'project:'+i.projectId+':member:'+a.memberId,
   projectId:i.projectId,before:{...i,member,row},
   summary:effect+' for member '+a.memberId+' on project '+i.projectId+
    '. Current effective permission: '+String(row.effectivePermission??'none')+
    '. This changes account access; verify all affected external consumers and keys.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const now=await projectAccess(a,c);
  const current=now.roleRows.find(m=>m.memberId===a.memberId);
  if(!current||current.userId!==before.member.userId||
     JSON.stringify(now.roleRows)!==JSON.stringify(before.roleRows)||
     JSON.stringify(now.permissions)!==JSON.stringify(before.permissions))
   throw Error('Project membership or sharing changed after the preview');
  if(now.actor&&now.actor===before.member.userId)
   throw Error('Changing the credential owner’s own access is refused');
  const path={project_id:before.projectId,member_id:a.memberId};
  return a.role==='inherit'?
    change('removeProjectMemberRole',{path},c,requestKey):
    change('setProjectMemberRole',{path,body:{role:a.role}},c,requestKey);
 },
 readAfter:projectAccess,
 verify:(before,after,a)=>{
  if(after.org!==before.org||after.projectId!==before.projectId)return false;
  const row=after.roleRows.find(m=>m.memberId===a.memberId);
  return row?.userId===before.member.userId&&
    (row.projectRole??null)===(a.role==='inherit'?null:a.role)&&
    after.roleRows.every(m=>m.memberId===a.memberId||
      JSON.stringify(m)===JSON.stringify(before.roleRows.find(x=>x.memberId===m.memberId)));
 }
});

const defs=[
 [memberRole,{memberId:uid,role:roleProp},['memberId','role']],
 [memberRemove,{memberId:uid},['memberId']],
 [memberInvite,{invitations:{type:'array',minItems:1,maxItems:10,items:{
   type:'object',properties:{email:emailProp,role:roleProp},required:['email','role'],
   additionalProperties:false}}},['invitations']],
 [share,{projectId:id,email:emailProp},['projectId','email']],
 [revokeShare,{projectId:id,permissionId:{type:'string',minLength:1,maxLength:120}},
  ['projectId','permissionId']],
 [projectMemberRole,{projectId:id,memberId:uid,role:{type:'string',
   enum:['viewer','editor','admin','inherit']}},['projectId','memberId','role']]
];
export const tools=defs.map(([d,fields,required])=>({...d.tool,profiles,area:'owner',
 audience:['owner'],description:{
  neon_member_set_role:'Preview and confirm an independently verified Neon organization member role change.',
  neon_member_remove:'Preview and confirm removal of a non-self, non-last-admin organization member.',
  neon_member_invite:'Preview and confirm up to ten personally authorized Neon invitation emails.',
  neon_access_share_project:'Preview and confirm scoped legacy Neon project email sharing.',
  neon_access_revoke_share:'Preview and confirm revocation of a verified legacy project share.',
  neon_access_set_project_role:'Preview and confirm exact per-project member role or return to organization defaults.'
 }[d.tool.name],inputSchema:schema({...fields,...base},required)}));
export const handlers=Object.fromEntries(defs.map(([d])=>[
 d.tool.name,async(a,c)=>d.handler(a,await writeContext(c))
]));
