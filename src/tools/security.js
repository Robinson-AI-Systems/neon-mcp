// D-8: project-scoped JWKS trust inventory. No JWT keys are fetched or returned.
// A provider URL with credentials, query parameters or fragments is redacted.
import {projectScope,projectClient,projectRead} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';

const id=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const role=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(x);
export const tools=[
 defineReadTool('neon_security_list_jwks',
  'List scoped trusted JWKS issuers without revealing embedded URL credentials.',{
   projectId:readId},{area:'security',audience:['owner','operator']}),
 defineReadTool('neon_security_review',
  'Review verified project network, replication, branch and JWKS security posture.',{
   projectId:readId},{area:'security',audience:['owner','operator']})
];
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
// Unknown fields are not safe defaults. Observed fields are facts, not approvals.
function observedBoolean(value){
 if(value===undefined||value===null)return {state:'unknown'};
 if(typeof value!=='boolean')throw Error('Invalid project security setting');
 return {state:'observed',value};
}
function observedIps(value){
 if(value===undefined||value===null)return {state:'unknown'};
 if(!value||!Array.isArray(value.ips)||value.ips.length>128||
    value.ips.some(x=>typeof x!=='string'||x.length>64||x.length===0)||
    (value.protected_branches_only!==undefined&&
      typeof value.protected_branches_only!=='boolean'))
  throw Error('Invalid IP allowance metadata');
 return {state:'observed',addressCount:value.ips.length,
  protectedBranchesOnly:value.protected_branches_only===true};
}
function verifiedBranchPosture(data,projectId){
 if(!Array.isArray(data?.branches)||data.branches.length>100||
    data.pagination?.cursor)
  throw Error('Complete security branch inventory unavailable');
 const seen=new Set();let protectedCount=0,defaultCount=0;
 for(const b of data.branches){
  if(!id(b?.id)||b.project_id!==projectId||seen.has(b.id)||
      typeof b.protected!=='boolean'||typeof b.default!=='boolean')
   throw Error('Branch security identity unverified');
  seen.add(b.id);
  if(b.protected)protectedCount++;
  if(b.default)defaultCount++;
 }
 if(defaultCount>1)throw Error('Multiple default branches reported');
 return {state:'observed',total:data.branches.length,
  protected:protectedCount,default:defaultCount};
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
 },
 async neon_security_review(a,c){
  const scope=projectScope(c,a.projectId??null);
  if(!scope.projectId)throw Error('Choose an authorized project for security');
  const {client}=await getClient(c,scope.projectId);
  const path={project_id:scope.projectId};
  const p=(await projectRead(client,'getProject',{path}))?.project;
  if(p?.id!==scope.projectId||p.org_id!==scope.org)
   throw Error('Project security identity unverified');
  const settings=p.settings;
  if(settings!==undefined&&settings!==null&&
      (typeof settings!=='object'||Array.isArray(settings)))
   throw Error('Project security settings invalid');
  const [branches,jwks]=await Promise.all([
   projectRead(client,'listProjectBranches',{path,query:{limit:100}}),
   projectRead(client,'getProjectJWKS',{path})
  ]);
  const posture=verifiedBranchPosture(branches,scope.projectId);
  const issuerCount=verifiedEntries(jwks,scope.projectId).length;
  const security=settings??{};
  return readText({projectId:scope.projectId,complete:true,
   checks:{
    protectedBranches:posture,
    publicConnectionsBlocked:observedBoolean(security.block_public_connections),
    vpcConnectionsBlocked:observedBoolean(security.block_vpc_connections),
    logicalReplicationEnabled:observedBoolean(security.enable_logical_replication),
    ipAllowlist:observedIps(security.allowed_ips),
    trustedJwks:{state:'observed',issuerCount}
   },
   notEvaluated:['RLS policy coverage','Login role access',
    'Advisor findings and live network reachability'],
   note:'Observed metadata is not proof of effective network isolation or RLS. Unknown settings are not assessed. No database or external JWKS endpoint was contacted.'});
 }};
}
export const handlers=createSecurityReadHandlers();
