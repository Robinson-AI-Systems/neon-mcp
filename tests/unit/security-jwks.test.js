import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,AT,project,mainBranch,devBranch,mainEndpoint,devEndpoint} from '../../test/helpers/neon-fixtures.js';
import {projectScope} from '../../src/tools/project-context.js';
import {createSecurityReadHandlers,tools,observedAuditLevel,verifiedReplicationExposure,configuredIssuerCoverage,verifiedEntries} from '../../src/tools/security.js';

const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'}};
const row={id:'jwks-fake-000001',project_id:IDS.project,
 provider_name:'FakeOIDC',jwks_url:'https://issuer.example.test/.well-known/jwks.json',
 created_at:AT,updated_at:AT,role_names:['authenticated']};
function make({projectRow=project(),entries=[row]}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_jwks',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:projectRow});
 fake.when('getProjectJWKS').resolves({jwks:entries});
 const handler=createSecurityReadHandlers({getClient:async(c,p)=>({
  client,scope:projectScope(c,p)})}).neon_security_list_jwks;
 return {fake,handler};
}
const json=x=>JSON.parse(x.content[0].text);
describe('D-8 scoped, secret-safe JWKS trust reads',()=>{
 it('declares a safe read in every connection profile with a closed schema',()=>{
  expect(tools).toHaveLength(2);
  expect(tools[0]).toMatchObject({name:'neon_security_list_jwks',
   writes:false,area:'security'});
  expect(tools[0].profiles).toContain('read_only');
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('verifies project identity, summarizes issuers and never fetches a JWT key',async()=>{
  const f=make();
  const result=json(await f.handler({},ctx));
  expect(result.total).toBe(1);
  expect(result.complete).toBe(true);
  expect(result.issuers[0]).toMatchObject({id:row.id,
   issuerHost:'issuer.example.test',jwksUrl:row.jwks_url,
   provider:'FakeOIDC',urlRedacted:false,roles:['authenticated']});
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  expect(f.fake.calls.filter(x=>x.operationId==='getProjectJWKS')).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('napi_FAKE');
  f.fake.assertClean();
 });
 it('never returns URL query secrets and does not fetch remote JWKS',async()=>{
  const f=make({entries:[{...row,
   jwks_url:'https://issuer.example.test/.well-known/jwks.json?token=FAKE_SENSITIVE'}]});
  const result=json(await f.handler({},ctx));
  expect(result.issuers[0]).toMatchObject({jwksUrl:null,
   issuerHost:'issuer.example.test',urlRedacted:true});
  expect(JSON.stringify(result)).not.toContain('FAKE_SENSITIVE');
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('refuses outside-project access before API reads',async()=>{
  const f=make();
  await expect(f.handler({projectId:'proj-fake-other'},ctx)).rejects.toThrow(/scope/);
  expect(f.fake.calls).toHaveLength(0);
 });
 it('rejects duplicate and foreign JWKS entries or incorrect project identity',async()=>{
  for(const params of [
   {entries:[row,row]},
   {entries:[{...row,project_id:'proj-fake-other'}]},
   {projectRow:project({org_id:'org-fake-other'})}
  ]){
   const f=make(params);
   await expect(f.handler({},ctx)).rejects.toThrow();
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('never treats arbitrary URL credentials as a safe issuer URL',async()=>{
  const f=make({entries:[{...row,
   jwks_url:'https://fake-user:FAKE_PASS@issuer.example.test/.well-known/jwks.json'}]});
  const result=json(await f.handler({},ctx));
  expect(result.issuers[0].jwksUrl).toBeNull();
  expect(result.issuers[0].urlRedacted).toBe(true);
  expect(JSON.stringify(result)).not.toContain('FAKE_PASS');
  f.fake.assertClean();
 });
});

function review({projectRow=project(),branches=[mainBranch(),devBranch()],
 endpoints=[mainEndpoint(),devEndpoint()],jwks=[row]}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_security_review',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:projectRow});
 fake.when('listProjectBranches').resolves({branches,annotations:{}});
 fake.when('listProjectEndpoints').resolves({endpoints});
 fake.when('getProjectJWKS').resolves({jwks});
 const handler=createSecurityReadHandlers({getClient:async(c,p)=>({
  client,scope:projectScope(c,p)})}).neon_security_review;
 return {fake,handler};
}
describe('D-8 independently verified project-security overview',()=>{
 it('uses bounded GET-only evidence without reading database connections',async()=>{
  const f=review({projectRow:project({settings:{
   block_public_connections:true,block_vpc_connections:false,
   enable_logical_replication:false,audit_log_level:'extended',
   allowed_ips:{ips:['192.0.2.0/24'],protected_branches_only:true}}})});
  const result=json(await f.handler({},ctx));
  expect(result.metadataComplete).toBe(true);
  expect(result.complete).toBeUndefined();
  expect(result.notEvaluated).toContain('RLS policy coverage');
  expect(result.checks).toMatchObject({
   protectedBranches:{state:'observed',total:2,protected:1,default:1},
   publicConnectionsBlocked:{state:'observed',value:true},
   vpcConnectionsBlocked:{state:'observed',value:false},
   logicalReplicationEnabled:{state:'observed',value:false},
   logicalReplicationImpact:{state:'observed',total:2,readWrite:2,
    readOnly:0,providerReportedActive:0,existingComputeContinuousMaxCuHours:1460,
    reversible:false,activeClientSessions:'notEvaluated',incrementalCharges:'notEvaluated'},
   auditLoggingLevel:{state:'observed',level:'extended',delivery:'notEvaluated',
    retention:'notEvaluated',billingImpact:'notEvaluated'},
   ipAllowlist:{state:'observed',addressCount:1,protectedBranchesOnly:true},
   trustedJwks:{state:'observed',issuerCount:1}
  });
  expect(result.notEvaluated).toContain('RLS policy coverage');
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  expect(f.fake.calls.map(x=>x.operationId).sort()).toEqual(
   ['getProject','getProjectJWKS','listProjectBranches','listProjectEndpoints'].sort());
  expect(JSON.stringify(result)).not.toMatch(/napi_FAKE|FAKE_SENSITIVE|postgresql:\/\//);
  f.fake.assertClean();
 });
 it('classifies configured JWT issuer trust on protected, development and removed branches without effectiveness claims',async()=>{
  const devIssuer={...row,id:'jwks-fake-000002',branch_id:IDS.dev,
   role_names:['authenticated']};
  const mainIssuer={...row,id:'jwks-fake-000003',branch_id:mainBranch().id,
   role_names:['authenticated']};
  const orphan={...row,id:'jwks-fake-000004',branch_id:'br-fake-deleted',
   role_names:['authenticated']};
  const f=review({jwks:[row,devIssuer,mainIssuer,orphan]});
  const out=json(await f.handler({},ctx));
  expect(out.checks.trustedJwks).toMatchObject({
   state:'observed',issuerCount:4,
   configuredCoverage:{state:'observed',configuredIssuerCount:4,
    assignedToCurrentBranches:2,unspecifiedSourceBranchCount:1,
    missingSourceBranchCount:1,protectedBranchIssuerCount:1,
    defaultBranchIssuerCount:1,configuredRoleReferences:4,
    missingSourceBranches:[{issuerId:orphan.id,sourceBranchId:orphan.branch_id}],
    tokenVerification:'notEvaluated',roleLoginEffectiveness:'notEvaluated'}});
  expect(out.checks.trustedJwks.configuredCoverage.perBranch)
   .toEqual(expect.arrayContaining([
    expect.objectContaining({branchId:IDS.dev,issuerCount:1}),
    expect.objectContaining({branchId:mainBranch().id,issuerCount:1,
     protected:true,default:true})
   ]));
  expect(out.notEvaluated).toContain('JWT token verification and PostgreSQL role login effectiveness');
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('refuses fabricated role references and inconsistent issuer branch identity',()=>{
  const branch=[mainBranch(),devBranch()];
  const one={id:row.id,roles:['authenticated'],branchId:IDS.dev};
  for(const entries of [
   [{...one,roles:['non role']}],
   [{...one,roles:'admin'}],
   [{...one,branchId:{id:IDS.dev}}],
   [{...one,id:'../evil'}]
  ])expect(()=>configuredIssuerCoverage(entries,branch)).toThrow(/Issuer/);
  expect(()=>configuredIssuerCoverage([one],[devBranch(),devBranch()]))
   .toThrow(/branch inventory/);
 });
 it('treats omitted project settings as unknown, never safe or enabled defaults',async()=>{
  const f=review();
  const result=json(await f.handler({},ctx));
  for(const k of ['publicConnectionsBlocked','vpcConnectionsBlocked',
   'logicalReplicationEnabled','auditLoggingLevel','ipAllowlist'])
   expect(result.checks[k]).toEqual({state:'unknown'});
  expect(result.checks.trustedJwks).toMatchObject({state:'observed',issuerCount:1,
   configuredCoverage:{unspecifiedSourceBranchCount:1,assignedToCurrentBranches:0,
    tokenVerification:'notEvaluated',roleLoginEffectiveness:'notEvaluated'}});
  f.fake.assertClean();
 });
 it('reports current audit level without claiming actual log delivery or pricing',async()=>{
  for(const level of ['base','extended','full']){
   const f=review({projectRow:project({settings:{audit_log_level:level}})});
   const result=json(await f.handler({},ctx));
   expect(result.checks.auditLoggingLevel).toEqual({state:'observed',level,
    delivery:'notEvaluated',retention:'notEvaluated',billingImpact:'notEvaluated'});
   expect(result.notEvaluated).toContain('Real replication subscribers, audit delivery and incremental billing');
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('rejects any unsupported or malformed audit level without a default',()=>{
  for(const level of ['off','HIPAA',true,7,'EXTENDED',''])
   expect(()=>observedAuditLevel(level)).toThrow(/audit logging level/);
  expect(observedAuditLevel(undefined)).toEqual({state:'unknown'});
  expect(observedAuditLevel(null)).toEqual({state:'unknown'});
 });
 it('validates every compute and prices no extra replication charges',async()=>{
  const f=review({endpoints:[mainEndpoint({current_state:'active'}),
   devEndpoint({type:'read_only',autoscaling_limit_max_cu:0.5})]});
  const result=json(await f.handler({},ctx));
  expect(result.checks.logicalReplicationImpact).toMatchObject({
   total:2,readWrite:1,readOnly:1,providerReportedActive:1,
   existingComputeContinuousMaxCuHours:1095,incrementalCharges:'notEvaluated',
   activeClientSessions:'notEvaluated',reversible:false});
  expect(JSON.stringify(result)).not.toContain('ep-fake-endpoint');
  f.fake.assertClean();
 });
 it('refuses duplicate, wrong-project and foreign-branch provider endpoints',async()=>{
  for(const endpoints of [
   [mainEndpoint(),mainEndpoint()],
   [mainEndpoint({project_id:'proj-fake-other'})],
   [mainEndpoint({branch_id:'br-fake-foreign'})]
  ]){
   const f=review({endpoints});
   await expect(f.handler({},ctx)).rejects.toThrow(/Compute identity/);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('rejects invalid endpoint capacity and metadata independent of API fixture schema',()=>{
  const branches=[mainBranch(),devBranch()];
  for(const endpoints of [
   [mainEndpoint({autoscaling_limit_max_cu:NaN})],
   [mainEndpoint({autoscaling_limit_max_cu:0})],
   [mainEndpoint({type:'unknown'})],
   [mainEndpoint({disabled:'false'})],
   [mainEndpoint({current_state:null})]
  ])expect(()=>verifiedReplicationExposure({endpoints},IDS.project,branches))
   .toThrow(/Compute identity|capacity/);
  expect(()=>verifiedReplicationExposure({endpoints:[mainEndpoint(),mainEndpoint()]},
   IDS.project,branches)).toThrow(/Compute identity/);
 });
 it('refuses foreign scope without provider access',async()=>{
  const f=review();
  await expect(f.handler({projectId:'proj-fake-outside'},ctx)).rejects.toThrow(/scope/);
  expect(f.fake.calls).toHaveLength(0);
 });
 it('refuses unverified project, duplicate branch, foreign branch and foreign issuer',async()=>{
  for(const variant of [
   {projectRow:project({org_id:'org-fake-outside'})},
   {branches:[devBranch(),devBranch()]},
   {branches:[mainBranch(),devBranch({project_id:'proj-fake-outside'})]},
   {jwks:[{...row,project_id:'proj-fake-outside'}]}
  ]){
   const f=review(variant);
   await expect(f.handler({},ctx)).rejects.toThrow();
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('rejects overlarge but schema-conformant allowlists rather than treating them as safe',async()=>{
  const f=review({projectRow:project({settings:{allowed_ips:{
   ips:Array.from({length:129},()=> '192.0.2.0/24'),
   protected_branches_only:true
  }}})});
  await expect(f.handler({},ctx)).rejects.toThrow(/allowance/);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
});

describe('D-8 fail-closed security provider metadata',()=>{
 it('refuses malformed JWT audience and duplicate configured role grants',()=>{
  for(const entry of [
   {...row,role_names:['authenticated','authenticated']},
   {...row,jwt_audience:123},
   {...row,jwt_audience:[]},
   {...row,jwt_audience:'x'.repeat(2049)}
  ])expect(()=>verifiedEntries({jwks:[entry]},IDS.project))
    .toThrow(/JWKS identity/);
  expect(verifiedEntries({jwks:[{...row,jwt_audience:'example-audience'}]},
    IDS.project)[0].jwtAudienceConfigured).toBe(true);
 });
 it('distinguishes missing IP scope from explicitly all-branch scope',async()=>{
  const f=review({projectRow:project({settings:{allowed_ips:{
   ips:['192.0.2.1','2001:db8::/64']}}})});
  const out=json(await f.handler({},ctx));
  expect(out.checks.ipAllowlist).toEqual({state:'observed',addressCount:2,
   protectedBranchesOnly:null});
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('refuses invalid addresses, duplicates and unknown provider allowlist restrictions',async()=>{
  for(const value of [
   {ips:['not-an-ip'],protected_branches_only:true},
   {ips:['192.0.2.1','192.0.2.1'],protected_branches_only:false},
   {ips:['192.0.2.0/33'],protected_branches_only:true},
   {ips:['192.0.2.1'],protected_branches_only:true,managedByProvider:true},
   {ips:['2001:db8::/129'],protected_branches_only:true}
  ]){
   const f=review({projectRow:project({settings:{allowed_ips:value}})});
   await expect(f.handler({},ctx)).rejects.toThrow(/allowance/);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
});
