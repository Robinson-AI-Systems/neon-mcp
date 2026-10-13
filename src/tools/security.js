// D-8: project-scoped JWKS trust inventory. No JWT keys are fetched or returned.
// A provider URL with credentials, query parameters or fragments is redacted.
import {isIP} from 'node:net';
import {projectScope,projectClient,projectRead} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';

const id=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const role=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(x);
export const tools=[
 defineReadTool('neon_security_list_jwks',
  'List scoped trusted JWKS issuers without revealing embedded URL credentials.',{
   projectId:readId},{area:'security',audience:['owner','operator']}),
 defineReadTool('neon_security_review',
  'Review project network, audit level, JWKS and verified replication compute exposure.',{
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
export function verifiedEntries(data,projectId){
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
        j.role_names.length>20||j.role_names.some(x=>!role(x))||
        new Set(j.role_names).size!==j.role_names.length))||
      (j.jwt_audience!==undefined&&
        (typeof j.jwt_audience!=='string'||j.jwt_audience.length>2048))||
      typeof j.jwks_url!=='string'||j.jwks_url.length>2048)
   throw Error('JWKS identity or scope unverified');
  seen.add(j.id);
  return {id:j.id,provider:j.provider_name,projectId,
   branchId:j.branch_id??null,...safeJwksUrl(j.jwks_url),
   jwtAudienceConfigured:typeof j.jwt_audience==='string'&&j.jwt_audience.length>0,
   roles:j.role_names??[],createdAt:j.created_at,updatedAt:j.updated_at};
 });
}
// Audit configuration is directly observable, but log delivery/retention, usage
// and billable impact are NOT established by reading a project's settings.
export function observedAuditLevel(value){
 if(value===undefined||value===null)return {state:'unknown'};
 if(!['base','extended','full'].includes(value))
  throw Error('Unrecognized project audit logging level');
 return {state:'observed',level:value,delivery:'notEvaluated',
  retention:'notEvaluated',billingImpact:'notEvaluated'};
}
// Replication can suspend all active endpoints and may prevent scale-to-zero.
// Inventory compute metadata without waking databases or assuming live clients.
export function verifiedReplicationExposure(data,projectId,branches){
 if(!Array.isArray(data?.endpoints)||data.endpoints.length>100||
    data.pagination?.cursor)
  throw Error('Complete bounded compute impact inventory unavailable');
 const known=new Set(branches.map(x=>x.id));
 const seen=new Set();let readWrite=0,readOnly=0,reportedActive=0,maxCu=0;
 for(const e of data.endpoints){
  if(!id(e?.id)||seen.has(e.id)||e.project_id!==projectId||
     !known.has(e.branch_id)||!['read_write','read_only'].includes(e.type)||
     typeof e.disabled!=='boolean'||
     typeof e.current_state!=='string'||!e.current_state||
     typeof e.autoscaling_limit_max_cu!=='number'||
     !Number.isFinite(e.autoscaling_limit_max_cu)||
     e.autoscaling_limit_max_cu<=0||e.autoscaling_limit_max_cu>10000)
   throw Error('Compute identity, branch or worst-case capacity unverified');
  seen.add(e.id);
  if(e.type==='read_write')readWrite++;else readOnly++;
  if(e.current_state==='active'&&!e.disabled)reportedActive++;
  if(!e.disabled)maxCu+=e.autoscaling_limit_max_cu;
 }
 if(!Number.isFinite(maxCu)||maxCu>100000)
  throw Error('Complete compute capacity cannot be bounded');
 return {state:'observed',total:data.endpoints.length,readWrite,readOnly,
  providerReportedActive:reportedActive,
  // Upper-bound scenario for current enabled compute maximums, not an
  // incremental bill or evidence of actual subscriber connections.
  existingComputeContinuousMaxCuHours:Math.ceil(maxCu*730),
  interruption:'Neon suspends all active endpoints when logical replication is enabled',
  reversible:false,activeClientSessions:'notEvaluated',
  incrementalCharges:'notEvaluated'};
}
// Classify only provider-CONFIGURED issuer assignments. Branch IDs missing
// from the current complete inventory are orphaned evidence, not safe removals;
// an unspecified branch is not assumed to trust every existing branch.
export function configuredIssuerCoverage(entries,branches){
 if(!Array.isArray(entries)||!Array.isArray(branches)||
    entries.length>100||branches.length>100)
  throw Error('Complete issuer and branch evidence required');
 const byId=new Map();
 for(const branch of branches){
  if(!id(branch?.id)||byId.has(branch.id)||
      typeof branch.protected!=='boolean'||typeof branch.default!=='boolean')
   throw Error('Issuer source branch inventory unverified');
  byId.set(branch.id,{branchId:branch.id,
   protected:branch.protected,default:branch.default,
   issuerCount:0,roleReferences:0});
 }
 let unspecifiedBranch=0,orphanedSource=0,protectedBranch=0,
  defaultBranch=0,totalRoleReferences=0;
 const orphans=[];
 for(const entry of entries){
  if(!id(entry?.id)||!Array.isArray(entry.roles)||
     entry.roles.length>20||entry.roles.some(x=>!role(x)))
   throw Error('Issuer roles or identity unverified');
  totalRoleReferences+=entry.roles.length;
  if(entry.branchId===null){
   unspecifiedBranch++;
   continue;
  }
  if(!id(entry.branchId))throw Error('Issuer branch identity unverified');
  const branch=byId.get(entry.branchId);
  if(!branch){
   orphanedSource++;
   orphans.push({issuerId:entry.id,sourceBranchId:entry.branchId});
   continue;
  }
  branch.issuerCount++;
  branch.roleReferences+=entry.roles.length;
  if(branch.protected)protectedBranch++;
  if(branch.default)defaultBranch++;
 }
 return {state:'observed',configuredIssuerCount:entries.length,
  assignedToCurrentBranches:entries.length-unspecifiedBranch-orphanedSource,
  unspecifiedSourceBranchCount:unspecifiedBranch,
  missingSourceBranchCount:orphanedSource,
  protectedBranchIssuerCount:protectedBranch,
  defaultBranchIssuerCount:defaultBranch,
  configuredRoleReferences:totalRoleReferences,
  missingSourceBranches:orphans,
  perBranch:[...byId.values()].filter(x=>x.issuerCount>0),
  tokenVerification:'notEvaluated',roleLoginEffectiveness:'notEvaluated',
  note:'Assignments and role references are configured provider metadata, not verified token acceptance or SQL role access.'};
}

// Unknown fields are not safe defaults. Observed fields are facts, not approvals.
function observedBoolean(value){
 if(value===undefined||value===null)return {state:'unknown'};
 if(typeof value!=='boolean')throw Error('Invalid project security setting');
 return {state:'observed',value};
}
// Read-only security posture does not treat invalid or future provider fields as verified.
function validIpOrCidr(value){
 if(typeof value!=='string'||value.length>64||value.trim()!==value)return false;
 const parts=value.split('/');
 const family=isIP(parts[0]);
 if(parts.length>2||!family)return false;
 return parts.length===1||(/^(0|[1-9][0-9]{0,2})$/.test(parts[1])&&
   Number(parts[1])<=(family===4?32:128));
}
function observedIps(value){
 if(value===undefined||value===null)return {state:'unknown'};
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(k=>!['ips','protected_branches_only'].includes(k))||
    !Array.isArray(value.ips)||value.ips.length>128||
    value.ips.some(x=>!validIpOrCidr(x))||
    new Set(value.ips.map(x=>x.toLowerCase())).size!==value.ips.length||
    (value.protected_branches_only!==undefined&&
      typeof value.protected_branches_only!=='boolean'))
  throw Error('Invalid IP allowance metadata');
 return {state:'observed',addressCount:value.ips.length,
  protectedBranchesOnly:value.protected_branches_only??null};
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
  const [branches,jwks,endpoints]=await Promise.all([
   projectRead(client,'listProjectBranches',{path,query:{limit:100}}),
   projectRead(client,'getProjectJWKS',{path}),
   projectRead(client,'listProjectEndpoints',{path})
  ]);
  const posture=verifiedBranchPosture(branches,scope.projectId);
  const issuers=verifiedEntries(jwks,scope.projectId);
  const issuerCoverage=configuredIssuerCoverage(issuers,branches.branches);
  const exposure=verifiedReplicationExposure(endpoints,scope.projectId,branches.branches);
  const security=settings??{};
  return readText({projectId:scope.projectId,metadataComplete:true,
   checks:{
    protectedBranches:posture,
    publicConnectionsBlocked:observedBoolean(security.block_public_connections),
    vpcConnectionsBlocked:observedBoolean(security.block_vpc_connections),
    logicalReplicationEnabled:observedBoolean(security.enable_logical_replication),
    logicalReplicationImpact:exposure,
    auditLoggingLevel:observedAuditLevel(security.audit_log_level),
    ipAllowlist:observedIps(security.allowed_ips),
    trustedJwks:{state:'observed',issuerCount:issuers.length,
      configuredCoverage:issuerCoverage}
   },
   notEvaluated:['RLS policy coverage','Login role access',
    'Advisor findings and live network reachability',
    'Real replication subscribers, audit delivery and incremental billing',
    'JWT token verification and PostgreSQL role login effectiveness'],
   note:'Compute impact is a point-in-time metadata inventory, not an active-client probe or billable increment. Enabling replication is irreversible and suspends active endpoints. Audit level is configured state only, not proof of delivered logs. JWKS branch/role assignments are configured metadata, not proof of usable JWT authentication. No database or external JWKS endpoint was contacted.'});
 }};
}
export const handlers=createSecurityReadHandlers();
