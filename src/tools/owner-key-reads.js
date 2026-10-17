// O-2 owner inventory: provider API-key metadata only, no API tokens or network addresses.
import {defineReadTool,readText} from './read-descriptors.js';
import {projectClient,projectRead} from './project-context.js';

const id=/^[a-z0-9-]{1,60}$/;
const selection=c=>{
 const org=c?.connection?.neonOrg??c?.connection?.neon_org;
 if(!id.test(org??'')||c?.connection?.profile!=='full'||
    c.connection.projectScope||c.connection.project_scope)
  throw Error('Select a full-owner organization connection and enroll an organization or personal administrator API key on the secure owner setup page');
 return org;
};
function safeRow(x,kind,org){
 if(!x||!Number.isSafeInteger(x.id)||x.id<1||typeof x.name!=='string'||
   !x.name||typeof x.created_at!=='string'||
   (x.project_id!=null&&!id.test(x.project_id)))
  throw Error('Incomplete or ambiguous provider API key inventory');
 const created=x.created_at;
 if(!Number.isFinite(Date.parse(created)))throw Error('Missing provider key creation date');
 return {id:x.id,name:x.name,kind,organizationId:org,
  projectId:x.project_id??null,createdAt:created,
  lastUsedAt:typeof x.last_used_at==='string'?x.last_used_at:null};
}
async function providerKeys(ctx,org,kind,{getClient=projectClient,read=projectRead}={}){
 const need=kind==='personal'?'personal':'org';
 const selected=await getClient(ctx,null,{need});
 if(selected.scope?.org!==org||selected.scope?.scoped||
    (need==='personal'&&(selected.credentialKind!=='personal'||
      !selected.credentialOwnerUserId)))
  throw Error('Provider key scope and owner are not independently verified');
 const response=await read(selected.client,
  need==='personal'?'listApiKeys':'listOrgApiKeys',
  need==='personal'?{}:{path:{org_id:org}});
 if(!Array.isArray(response)||response.length>1000)
  throw Error('Provider key inventory incomplete or too large');
 const keys=response.map(x=>safeRow(x,kind,org));
 if(new Set(keys.map(x=>x.id)).size!==keys.length)
  throw Error('Duplicate provider API key identifiers');
 return keys;
}
export const tools=[{...defineReadTool(
 'neon_apikey_list',
 'List safe personal, organization and project-scoped API key metadata, never tokens.',
 {includePersonal:{type:'boolean'},includeOrganization:{type:'boolean'}},
 {area:'owner',audience:['owner']}),profiles:['full']}];

export function createOwnerKeyReadHandlers({
 getClient=projectClient,read=projectRead
}={}){
 return {async neon_apikey_list(args,ctx){
  const org=selection(ctx),result={organizationId:org,scope:'full_owner',
   personal:{state:'not_requested'},organization:{state:'not_requested'}};
  if(args.includePersonal!==false){
   try{result.personal={state:'observed',keys:await providerKeys(ctx,org,'personal',{getClient,read})};}
   catch{result.personal={state:'unavailable',
     nextAction:'Enroll or verify a personal administrator API key on the owner setup page'};}
  }
  if(args.includeOrganization!==false){
   try{result.organization={state:'observed',keys:await providerKeys(ctx,org,'organization',{getClient,read})};}
   catch{result.organization={state:'unavailable',
     nextAction:'Enroll or verify an organization API key on the owner setup page'};}
  }
  // The server vault is not Neon provider inventory; distinguish labels/IDs.
  const local=await ctx.db.listNeonKeySummaries(org);
  if(!Array.isArray(local)||local.length>2000)throw Error('Local key inventory unavailable');
  result.serverKeys=local.map(row=>({
   vaultId:row.id,kind:row.kind,organizationId:org,
   projectId:row.project_id??null,last4:row.last4,
   label:row.label??null,revoked:row.revoked_at!=null,
   storedAt:row.added_at??null
  }));
  return readText(result);
 }};
}
export const handlers=createOwnerKeyReadHandlers();
