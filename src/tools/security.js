// D-8: project-scoped JWKS trust inventory. No JWT keys are fetched or returned.
// A provider URL with credentials, query parameters or fragments is redacted.
import {projectScope,projectClient,projectRead} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';

const id=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const role=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(x);
export const tools=[defineReadTool('neon_security_list_jwks',
 'List scoped trusted JWKS issuers without revealing embedded URL credentials.',{
  projectId:readId},{area:'security',audience:['owner','operator']})];
function safeJwksUrl(raw){
 try{
  const u=new URL(raw);
  const safe=u.protocol==='https:'&&u.username===''&&u.password===''&&
   u.search===''&&u.hash===''&&u.hostname.length>0&&u.port==='';
  return {issuerHost:u.hostname.slice(0,255),
   jwksUrl:safe?u.href:null,urlRedacted:!safe};
 }catch{throw Error('JWKS URL could not be parsed safely');}
}
function verifiedEntries(data,projectId){
 if(!Array.isArray(data?.jwks)||data.jwks.length>100||
      data.pagination?.cursor)
  throw Error('Complete bounded JWKS trust inventory unavailable');
 const seen=new Set();
 return data.jwks.map(j=>{
  if(!j||!id(j.project_id)||j.project_id!==projectId||
      typeof j.id!=='string'||!j.id||j.id.length>100||seen.has(j.id)||
      typeof j.provider_name!=='string'||
      !/^[A-Za-z0-9 _.-]{1,80}$/.test(j.provider_name)||
      (j.branch_id!==undefined&&!id(j.branch_id))||
      typeof j.created_at!=='string'||!Number.isFinite(Date.parse(j.created_at))||
      typeof j.updated_at!=='string'||!Number.isFinite(Date.parse(j.updated_at))||
      (j.role_names!==undefined&&(!Array.isArray(j.role_names)||
        j.role_names.length>20||j.role_names.some(x=>!role(x))))||
      typeof j.jwks_url!=='string'||j.jwks_url.length>2048)
   throw Error('JWKS identity or scope unverified');
  seen.add(j.id);
  return {id:j.id,provider:j.provider_name,projectId,
   branchId:j.branch_id??null,...safeJwksUrl(j.jwks_url),
   jwtAudienceConfigured:typeof j.jwt_audience==='string'&&j.jwt_audience.length>0,
   roles:j.role_names??[],createdAt:j.created_at,updatedAt:j.updated_at};
 });
}
export function createSecurityReadHandlers({getClient=projectClient}={}){
 return {async neon_security_list_jwks(a,c){
  const scope=projectScope(c,a.projectId??null);
  if(!scope.projectId)throw Error('Choose an authorized project for security');
  const {client}=await getClient(c,scope.projectId);
  const path={project_id:scope.projectId};
  const p=await projectRead(client,'getProject',{path});
  if(p?.project?.id!==scope.projectId||p.project.org_id!==scope.org)
   throw Error('JWKS project and owner identity unverified');
  const entries=verifiedEntries(await projectRead(client,'getProjectJWKS',{path}),
   scope.projectId);
  return readText({projectId:scope.projectId,issuers:entries,
   total:entries.length,complete:true,
   note:'JWKS URL parameters are redacted and no remote JWKS endpoint is contacted.'});
 }};
}
export const handlers=createSecurityReadHandlers();
