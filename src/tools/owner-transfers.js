// O-2: project ownership moves are always production-class and require live safeguards.
import {defineWrite} from '../core/write.js';
import {call} from '../neon/client.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {projectClient,projectRead} from './project-context.js';
import {checkSecretStorage} from './role-write-shared.js';

const ID=/^[a-z0-9-]{1,60}$/;
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const common={dryRun:{type:'boolean'},confirm:{type:'boolean'},
 outsideApp:{type:'boolean'},requestKey:{type:'string',minLength:8,maxLength:128}};
const schema=(fields,required)=>({type:'object',properties:{...fields,...common},
 required,additionalProperties:false});
function scope(ctx){
 const org=ctx?.connection?.neonOrg??ctx?.connection?.neon_org;
 if(!ID.test(org??'')||ctx.connection.profile!=='full'||
    ctx.connection.projectScope||ctx.connection.project_scope)
  throw Error('Only verified full-owner organization connections can transfer projects');
 return org;
}
async function client(ctx,need){
 const org=scope(ctx),s=await projectClient(ctx,null,{need});
 if(s.scope?.org!==org||s.scope.scoped||
    (need==='personal'&&(s.credentialKind!=='personal'||!s.credentialOwnerUserId)))
  throw Error('Verified personal org administrator credential needed');
 return s.client;
}
async function projectFacts(ctx,projectId,selectedClient){
 const org=scope(ctx);
 if(!ID.test(projectId??''))throw Error('Invalid project selection');
 const c=selectedClient??await client(ctx,'org');
 const data=await projectRead(c,'getProject',{path:{project_id:projectId}});
 const p=data?.project;
 if(p?.id!==projectId||p.org_id!==org)throw Error('Project ownership mismatch');
 const listing=await projectRead(c,'listProjectBranches',{
  path:{project_id:projectId},query:{limit:100}});
 if(!Array.isArray(listing?.branches)||listing.pagination?.cursor||
    listing.branches.length>100)throw Error('Default branch inventory unavailable');
 const defaults=listing.branches.filter(x=>x.default===true);
 if(defaults.length!==1||!ID.test(defaults[0].id))
  throw Error('Exactly one verified default branch required');
 // Neon's project list may expose integrations and applications separately.
 // Do not infer that a missing provider field means an integration is absent.
 const discover=await projectRead(c,'listProjects',{
  query:{org_id:org,search:projectId,limit:100}});
 const projects=discover?.projects??[];
 if(!Array.isArray(projects)||discover?.pagination?.cursor||
   discover?.unavailable_project_ids?.length||projects.filter(x=>x.id===projectId&&x.org_id===org).length!==1)
  throw Error('Project inventory incomplete before ownership transfer');
 const integrations=discover.integrations?.[projectId];
 const applications=discover.applications?.[projectId];
 const known=Array.isArray(integrations)&&Array.isArray(applications);
 return {projectId,org,defaultBranchId:defaults[0].id,
  integrationsKnown:known,integrations:known?integrations.map(x=>
    typeof x==='string'?x:x?.name??x?.type??'unidentified'):[],
  applications:known?applications.map(x=>typeof x==='string'?x:x?.name??'app'):[]};
}
async function verifyDestination(ctx,dest,neon){
 if(!ID.test(dest??'')||dest===scope(ctx))throw Error('Valid different destination organization required');
 const org=(await projectRead(neon,'getOrganization',{path:{org_id:dest}}));
 const resolved=org?.organization??org;
 if(resolved?.id!==dest)throw Error('Destination organization not independently visible');
 const account=await projectRead(neon,'getCurrentUserInfo');
 const user=account?.user??account;
 if(typeof user?.id!=='string'||!user.id)throw Error('Destination actor identity unverified');
 const members=await projectRead(neon,'getOrganizationMembers',{
  path:{org_id:dest},query:{limit:500}});
 if(!Array.isArray(members?.members)||members.pagination?.next)
  throw Error('Destination authorization cannot be completely verified');
 if(!members.members.some(x=>{
  const member=x.member??x;
  return member.org_id===dest&&member.user_id===user.id&&
    member.role==='admin';
 }))throw Error('Personal administrator does not have verified destination membership');
 return dest;
}
function note(facts){
 const integrationNote=facts.integrationsKnown?
  ' known integrations: '+JSON.stringify(facts.integrations)+
    '; applications: '+JSON.stringify(facts.applications):
  ' integrations and applications NOT verified; check Vercel/GitHub and reconnect them as needed';
 return facts.projectId+' (default '+facts.defaultBranchId+')'+integrationNote;
}
async function writeContext(ctx,need){
 scope(ctx);
 const trusted=await createProjectWriteContext(ctx,{keyNeed:need});
 const guards=trusted.guards;
 return {...trusted,guards:{
  checkProtected:async(target,c)=>{
   const facts=target.before?.projects??[target.before?.project];
   if(!Array.isArray(facts)||facts.some(x=>!x?.projectId))return false;
   for(const p of facts)
    if(await guards.checkProtected({projectId:p.projectId,
       target:'project:'+p.projectId},c)!==true)return false;
   return true;
  },
  checkApp:async(target,c,args)=>{
   const facts=target.before?.projects??[target.before?.project];
   if(!Array.isArray(facts)||facts.some(x=>!x?.projectId))return false;
   for(const p of facts)
    if(await guards.checkApp({projectId:p.projectId,
      target:'project:'+p.projectId},c,args)!==true)return false;
   return true;
  },
  checkProduction:async(target,c,tool)=>{
   const facts=target.before?.projects??[target.before?.project];
   if(!Array.isArray(facts)||!facts.length)return {allowed:false,production:true};
   for(const p of facts){
    const result=await guards.checkProduction({projectId:p.projectId,
      target:'project:'+p.projectId},c,tool);
    if(result.allowed!==true||result.production!==true)
     return {allowed:false,production:true};
   }
   return {allowed:true,production:true};
  },
  checkSpend:guards.checkSpend
 }};
}
const request=defineWrite({name:'neon_transfer_request_create',key:'org',
 projectWide:true,access:true,destructive:true,secret:true,
 plan:async(a,c)=>{
  scope(c);if(!ID.test(a.projectId??'')||
   (a.ttlSeconds!==undefined&&(!Number.isInteger(a.ttlSeconds)||
     a.ttlSeconds<60||a.ttlSeconds>604800)))
   throw Error('Select one project and TTL of 60 seconds to seven days');
  checkSecretStorage(c);
  const p=await projectFacts(c,a.projectId);
  return {target:'project:'+p.projectId+':transfer-request',
   projectId:p.projectId,before:{project:p},
   summary:'PRODUCTION ownership transfer request for '+note(p)+
    '. Whoever accepts the claim will own the project; acceptance can interrupt access.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const current=await projectFacts(c,a.projectId);
  if(JSON.stringify(current)!==JSON.stringify(before.project))
   throw Error('Project changed since preview');
  const neon=await client(c,'org');
  const reply=await call(neon,'createProjectTransferRequest',{
   path:{project_id:a.projectId},
   body:a.ttlSeconds?{ttl_seconds:a.ttlSeconds}:{}
  },{write:true,requestKey});
  if(reply.error)return {confirmed:reply.error.code==='unknown_outcome'?'pending':false};
  const data=reply.data?.transfer_request??reply.data;
  if(!ID.test(data?.id??'')||data.project_id!==a.projectId||
   !Number.isFinite(Date.parse(data.expires_at??'')))
   return {confirmed:'pending'};
  // The provider returns an ID, NOT a verified Console claim URL. Deliver
  // claim identifiers and official acceptance instructions only in owner escrow.
  const secret=await checkSecretStorage(c).putOneTimeSecret({
   org:scope(c),kind:'neon_transfer_claim',
   label:'Transfer request '+a.projectId,
   secret:JSON.stringify({projectId:a.projectId,requestId:data.id,
    expiresAt:data.expires_at,
    method:'Recipient accepts using Neon Console claim flow or the official Neon API PUT /projects/{project_id}/transfer_requests/{request_id}. No Console claim URL is returned by Neon API.'})
  });
  c.transferClaimOneTime=secret.link;
  c.transferRequestId=data.id;
  return {confirmed:true};
 },
 readAfter:async(a,c)=>projectFacts(c,a.projectId),
 verify:(before,after,_a,c)=>ID.test(c.transferRequestId??'')&&
  after.projectId===before.project.projectId&&after.org===before.project.org
});
const between=defineWrite({name:'neon_transfer_projects_between_orgs',
 key:'org',projectWide:true,access:true,destructive:true,
 plan:async(a,c)=>{
  if(!Array.isArray(a.projectIds)||a.projectIds.length<1||
    a.projectIds.length>8||new Set(a.projectIds).size!==a.projectIds.length||
    a.projectIds.some(x=>!ID.test(x??'')))
   throw Error('Select 1–8 distinct projects from this organization');
  const neon=await client(c,'personal');
  const destination=await verifyDestination(c,a.destinationOrgId,neon);
  const projects=[];
  for(const projectId of a.projectIds)projects.push(await projectFacts(c,projectId,neon));
  return {target:'org:'+scope(c)+':transfer:'+destination+':'+a.projectIds.slice().sort().join(','),
   projectId:a.projectIds[0],before:{projects,destination},
   summary:'PRODUCTION move '+a.projectIds.length+' projects from '+scope(c)+
    ' to '+destination+': '+projects.map(note).join('; ')+
    '. GitHub and Vercel integrations may block the move or require reconfiguration; this is ownership-changing.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const neon=await client(c,'personal');
  await verifyDestination(c,before.destination,neon);
  for(const p of before.projects){
   const now=await projectFacts(c,p.projectId,neon);
   if(JSON.stringify(p)!==JSON.stringify(now))throw Error('Project changed after preview');
  }
  const reply=await call(neon,'transferProjectsFromOrgToOrg',{
   path:{source_org_id:scope(c)},
   body:{destination_org_id:before.destination,project_ids:before.projects.map(p=>p.projectId)}
  },{write:true,requestKey});
  return {confirmed:reply.error?
   (reply.error.code==='unknown_outcome'?'pending':false):true};
 },
 readAfter:async(a,c)=>{
  const neon=await client(c,'personal');
  const projects=[];
  for(const projectId of a.projectIds){
   const project=(await projectRead(neon,'getProject',{path:{project_id:projectId}}))?.project;
   projects.push({projectId,org:project?.org_id??null});
  }
  return projects;
 },
 verify:(before,after)=>after.length===before.projects.length&&
  after.every(p=>p.org===before.destination&&
   before.projects.some(b=>b.projectId===p.projectId))
});
const defs=[
 [request,{projectId:id,ttlSeconds:{type:'integer',minimum:60,maximum:604800}},['projectId']],
 [between,{projectIds:{type:'array',minItems:1,maxItems:8,uniqueItems:true,
  items:id},destinationOrgId:id},['projectIds','destinationOrgId']]
];
export const tools=defs.map(([d,fields,required])=>({...d.tool,
 profiles:['full'],area:'owner',audience:['owner'],
 description:d===request?
 'Create a production-guarded expiring ownership claim, delivering its instructions only via the owner one-time page.':
 'Transfer all selected projects between verified organizations with per-project safety and destination checks.',
 ...(d===request?{secretRoute:'/api/neon/setup',oneTimeOnly:true}:{}),
 inputSchema:schema(fields,required)}));
export const handlers=Object.fromEntries(defs.map(([d])=>[d.tool.name,async(args,ctx)=>{
 const trusted=await writeContext(ctx,d===between?'personal':'org');
 const result=await d.handler(args,trusted);
 if(d===request&&trusted.transferClaimOneTime){
  const output=JSON.parse(result.content[0].text);
  if(output.confirmed===true)
   result.content[0].text=JSON.stringify({...output,oneTimeSecretLink:trusted.transferClaimOneTime,
    claimLinkStatus:'Neon API returns a request ID, not a console claim URL'});
 }
 return result;
}]));
