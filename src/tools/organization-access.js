// O-1: verified, bounded organization and project access inventories.
// Reads may never silently substitute a project-scoped key for org authority.
import {projectClient,projectRead,projectScope} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';

const MAX_MEMBERS=500;
const MAX_PAGES=15;
const cleanId=/^[a-z0-9-]{1,60}$/;
const uuid=/^[A-Za-z0-9-]{1,80}$/;
const profiles=['full'];
const orgRead=(name,description,properties)=>({
 ...defineReadTool(name,description,properties,{area:'owner',audience:['owner']}),
 profiles
});

export const tools=[
 orgRead('neon_org_list','Show the independently verified organization selected by this connector. No keys or private billing fields.',{}),
 orgRead('neon_member_list','List organization members and pending invitations with exact roles and bounded pagination.',{
  includeInvitations:{type:'boolean'},limit:{type:'integer',minimum:1,maximum:500}
 }),
 orgRead('neon_access_list','Show exact existing legacy project shares without changing permissions.',{
  projectId:readId
 })
];

function orgId(ctx){
 const org=ctx?.connection?.neonOrg??ctx?.connection?.neon_org;
 if(!cleanId.test(org??'')||ctx?.connection?.profile!=='full'||
    ctx?.connection?.projectScope||ctx?.connection?.project_scope)
  throw Error('Full owner organization scope is required for organization access');
 return org;
}
async function orgClient(ctx,getClient){
 const org=orgId(ctx);
 let selected;
 try{selected=await getClient(ctx,null,{need:'org'});}
 catch(error){
  if(error?.code==='NEON_KEY_UNAVAILABLE'||/key is unavailable/i.test(error?.message??''))
   throw Error('Add a verified organization API key on the owner setup page (IN-04)');
  throw error;
 }
 if(selected?.scope?.org!==org||selected?.scope?.scoped)
  throw Error('Neon organization credential scope could not be verified');
 return {org,client:selected.client,credentialKind:selected.credentialKind,
  ownerUserId:selected.credentialOwnerUserId??null};
}
function collection(value,key){
 if(!value||!Array.isArray(value[key]))throw Error('Incomplete Neon '+key+' inventory');
 return value[key];
}
function memberInfo(row,org){
 const m=row?.member??row;
 if(!m||!uuid.test(m.id??'')||m.org_id!==org||
    !['admin','editor','member','viewer','collaborator'].includes(m.role))
  throw Error('Invalid or foreign organization member');
 return {id:m.id,userId:typeof m.user_id==='string'?m.user_id:null,
  role:m.role,joinedAt:m.joined_at??null,
  email:typeof row?.user?.email==='string'?row.user.email:null};
}
function invitationInfo(row,org){
 if(!row||!uuid.test(row.id??'')||row.org_id!==org||
    typeof row.email!=='string'||!row.email.includes('@')||
    !['admin','editor','member','viewer','collaborator'].includes(row.role))
  throw Error('Invalid or foreign organization invitation');
 return {id:row.id,email:row.email,role:row.role,
  invitedAt:row.invited_at??null,acceptedAt:row.accepted_at??null};
}
export async function members(client,org,limit,{read=projectRead}={}){
 const all=[],seenIds=new Set(),seenCursors=new Set();
 let cursor=null;
 for(let i=0;i<MAX_PAGES;i++){
  const query={limit:Math.min(500,limit-all.length)};
  if(cursor)query.cursor=cursor;
  const data=await read(client,'getOrganizationMembers',{
   path:{org_id:org},query});
  for(const row of collection(data,'members')){
   const m=memberInfo(row,org);
   if(seenIds.has(m.id))throw Error('Duplicate organization member');
   seenIds.add(m.id);all.push(m);
   if(all.length>limit)throw Error('Unbounded organization member response');
  }
  const next=data.pagination?.next??null;
  if(!next)return {members:all,capped:false};
  if(typeof next!=='string'||!next||seenCursors.has(next))
   throw Error('Invalid organization member pagination');
  if(all.length>=limit)return {members:all,capped:true};
  seenCursors.add(next);cursor=next;
 }
 throw Error('Organization membership pagination exceeded its safety budget');
}
function permissionInfo(row){
 if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||
   typeof (row.granted_to_email??row.email)!=='string'||
   !(row.granted_to_email??row.email).includes('@'))
  throw Error('Invalid project share identity');
 return {id:row.id,email:row.granted_to_email??row.email,grantedAt:row.granted_at??null,
  // Legacy permission is not the new project-role API: don't invent a role.
  role:row.role??null};
}
export function createOrganizationAccessReadHandlers({
 getClient=projectClient,read=projectRead
}={}){
 return {
  async neon_org_list(_args,ctx){
   const {org,client}=await orgClient(ctx,getClient);
   const data=await read(client,'getOrganization',{path:{org_id:org}});
   const o=data?.organization??data;
   if(o?.id!==org||typeof o.name!=='string')
    throw Error('Organization identity could not be verified');
   return readText({organizations:[{id:o.id,name:o.name,
    plan:typeof o.plan==='string'?o.plan:null}],scope:'selected_organization'});
  },
  async neon_member_list(args,ctx){
   const {org,client}=await orgClient(ctx,getClient);
   const max=args.limit??100;
   if(!Number.isInteger(max)||max<1||max>MAX_MEMBERS)
    throw Error('Invalid member list limit');
   // The helper's real data path uses projectRead to preserve error shaping.
   const list=await members(client,org,max,{read});
   let invitations=null;
   if(args.includeInvitations===true){
    const data=await read(client,'getOrganizationInvitations',{path:{org_id:org}});
    const ids=new Set();
    invitations=collection(data,'invitations').map(row=>{
     const item=invitationInfo(row,org);
     if(ids.has(item.id))throw Error('Duplicate invitation');
     ids.add(item.id);return item;
    });
    if(invitations.length>500)throw Error('Too many invitations for a complete inventory');
   }
   return readText({...list,...(invitations?{invitations}:{})});
  },
  async neon_access_list(args,ctx){
   const {org,client}=await orgClient(ctx,getClient);
   const projectId=projectScope(ctx,args.projectId??null).projectId;
   if(!projectId)throw Error('Choose a project');
   const data=await read(client,'getProject',{path:{project_id:projectId}});
   if(data?.project?.id!==projectId||data.project.org_id!==org)
    throw Error('Project identity could not be verified');
   const result=await read(client,'listProjectPermissions',{path:{project_id:projectId}});
   const seen=new Set();
   const permissions=collection(result,'project_permissions').map(row=>{
    const p=permissionInfo(row);
    if(seen.has(p.id))throw Error('Duplicate project share');
    seen.add(p.id);return p;
   });
   if(permissions.length>500)throw Error('Too many project shares for a complete inventory');
   return readText({projectId,legacyShares:permissions,
    projectMemberRoles:{state:'not_evaluated',
     reason:'Legacy sharing API is not the newer project-role grant inventory'}});
  }
 };
}
export const handlers=createOrganizationAccessReadHandlers();
