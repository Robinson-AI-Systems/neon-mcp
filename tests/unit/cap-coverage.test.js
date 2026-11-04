import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {registry} from '../../src/tools/index.js';
import {generateCoverage,runCoverage} from '../../scripts/cap-coverage.mjs';
import {pinnedOperations,verifiedSourcePin,buildCapabilityInventory,
  validateCapabilityInventory,capabilityGapReport,formatCapabilityGapReport,
  officialSdkOperations,verifyOfficialSdkRaw,sha256
} from '../../src/core/cap-coverage.js';
import {collectSourceOperationReferences,collectDeclaredSdkFallbacks} from '../../src/core/cap-source-references.js';
import {projectOpenApiContracts,projectOperationWire,contractDigest,
  validateOfficialWireSnapshot,verifiedOfficialWireRaw} from '../../src/core/cap-api-contract.js';

const spec=parse(readFileSync('vendor/neon-openapi/v2.yaml','utf8'));
const specText=readFileSync('vendor/neon-openapi/v2.yaml','utf8');
const sourceText=readFileSync('vendor/neon-openapi/SOURCE.md','utf8');
const productSurfaces=JSON.parse(readFileSync('docs/capabilities/neon-product-surfaces.json','utf8'));
const currentControlPlane=JSON.parse(readFileSync('docs/capabilities/current-control-plane.json','utf8'));
const officialWireSnapshot=JSON.parse(readFileSync('docs/capabilities/current-control-plane-contracts.json','utf8'));
function fakeSdk(operations){
  const revision='1'.repeat(40);
  return {schemaVersion:1,version:'v2',host:'https://console.neon.tech/api/v2',
    source:{revision,repository:'neondatabase/neon-pkgs',
      path:'packages/sdk/spec/neon-openapi.json',
      url:'https://raw.githubusercontent.com/neondatabase/neon-pkgs/'+revision+
        '/packages/sdk/spec/neon-openapi.json',
      sha256:'a'.repeat(64)},
    operations,operationDigest:sha256(JSON.stringify(operations))};
}
function fakeWireSnapshot(reference){
  const spec={paths:{}};
  for(const row of reference.operations){
    spec.paths[row.path]??={};
    spec.paths[row.path][row.method.toLowerCase()]={operationId:row.operationId,
      responses:{'200':{description:'OK'}}};
  }
  const contracts=projectOpenApiContracts(spec);
  return {schemaVersion:1,revision:reference.source.revision,
    sourceSha256:reference.source.sha256,operationDigest:reference.operationDigest,
    contractDigest:contractDigest(contracts),contracts};
}
const sourcePin=verifiedSourcePin({specText,sourceText});
const {sourceFiles,sdkRawOperationNames,clientSource,sdkVersion}=generateCoverage();
function inventory(){return structuredClone(generateCoverage().inventory);}
function validate(x){return validateCapabilityInventory({
  inventory:x,spec,sourcePin,registry,productSurfaces,currentControlPlane,sourceFiles,
  sdkRawOperationNames,clientSource,sdkVersion,officialWireSnapshot});}
describe('CAP-1 complete but conservative operation inventory',()=>{
  it('checks all pinned real API methods with their exact source hash and distinct newer products',()=>{
    const map=inventory(),expected=pinnedOperations(spec);
    expect(expected).toHaveLength(163);
    expect(map.controlPlane.sha256).toBe(sourcePin.sha256);
    expect(map.externalSurfaces.count).toBe(15);
    expect(map.registry.registeredTools).toBe(registry.tools.length);
    expect(map.currentControlPlane.expectedOperations).toBe(193);
    expect(map.currentControlPlane.newToPinned).toBe(31);
    expect(map.currentControlPlane.pinnedOnly).toBe(1);
    expect(map.rows).toHaveLength(209);
    expect(map.wireContracts).toMatchObject({vendored:163,official:193,sharedDeclaredDrift:17,
      officialDigest:officialWireSnapshot.contractDigest});
    expect(validateOfficialWireSnapshot(currentControlPlane,officialWireSnapshot)).toHaveLength(193);
    expect(map.rows.filter(x=>x.wireState==='shared-wire-drift')).toHaveLength(17);
    expect(map.rows.find(x=>x.operationId==='updateProject').wire.request.required).toBe(true);
    expect(map.rows.find(x=>x.operationId==='listProjects').wire.parameters.some(x=>
      x.name==='limit'&&x.in==='query')).toBe(true);

    expect(map.sdkDispatch).toEqual({version:'7.0.1',total:194,
      rawExport:159,aliasedExport:17,fallbackOnly:4,withoutGenericDispatch:14});
    expect(validate(map)).toEqual({
      controlPlane:163,currentControlPlane:193,newSdkOperations:31,
      pinnedOnly:1,advanced:15,total:209});
    expect(map.rows.map(x=>x.key)).toEqual([...new Set(map.rows.map(x=>x.key))].sort((a,b)=>a.localeCompare(b)));
  });
  it('keeps real operation references distinct from verified execution and live proof',()=>{
    const map=inventory();
    expect(map.rows.filter(x=>x.source.status==='candidate').length).toBeGreaterThan(1);
    expect(map.rows.every(x=>!x.source.guardedExecutionVerified)).toBe(true);
    expect(map.rows.every(x=>x.live.status==='unverified')).toBe(true);
    expect(map.rows.some(x=>x.origin==='documented-advanced-product'&&
      x.family==='object_storage')).toBe(true);
    expect(map.rows.filter(x=>x.origin==='official-sdk-reference')).toHaveLength(31);
    expect(map.rows.every(x=>!x.source.tests.includes('tests/unit/cap-coverage.test.js'))).toBe(true);
    expect(map.rows.filter(x=>x.origin==='vendored-openapi'&&
      x.currentSdkState==='not-in-sdk-reference')).toHaveLength(1);
    expect(map.rows.find(x=>x.operationId==='listNeonAuthOAuthClients')?.ownerUnit)
      .toBe('E-1');
    const storage=map.rows.find(x=>x.operationId==='object-storage:put');
    expect(storage.credentials.product_scoped_credential.status).toBe('supported');
    expect(storage.requiredPermissions).toBe('storage:write');
    expect(map.rows.find(x=>x.operationId==='listProjectMembers').sdkDispatch.genericClientState)
      .toBe('raw-export');
    expect(map.rows.find(x=>x.operationId==='getProjectJWKS').sdkDispatch.genericClientState)
      .toBe('fallback-declared');
    expect(map.rows.find(x=>x.operationId==='getProjectJWKS').sdkDispatch.declaredFallback.flag)
      .toBe('jwksRead');
    expect(map.rows.find(x=>x.operationId==='listNeonAuthOAuthClients').sdkDispatch.genericClientState)
      .toBe('no-dispatch-path');
    const api=map.rows.find(x=>x.origin==='vendored-openapi');
    expect(api.credentials.sql_login.status).toBe('unsupported');
    expect(api.credentials.project_api_key.status).toBe('unknown');
    expect(api.credentials.delegated_oauth.status).toBe('unknown');
  });
  it('detects schema origin mutations, hash drift and duplicate operation IDs',()=>{
    expect(()=>verifiedSourcePin({specText:specText+' ',sourceText})).toThrow(/pin/i);
    const fake=structuredClone(spec);
    const first=Object.values(fake.paths).find(x=>x.get)?.get;
    first.operationId='duplicate_operation';
    const second=Object.values(fake.paths).find(x=>x.post)?.post;
    second.operationId='duplicate_operation';
    expect(()=>pinnedOperations(fake)).toThrow(/duplicate/i);
  });
  it('rejects reference-only API drift, duplicate SDK records and stale snapshot hashes',()=>{
    const all=officialSdkOperations(currentControlPlane);
    expect(all).toHaveLength(193);
    expect(new Set(all.map(x=>x.operationId)).size).toBe(193);
    const bad=structuredClone(currentControlPlane);
    bad.operations[0].operationId='forged-id';
    expect(()=>officialSdkOperations(bad)).toThrow(/digest/i);
    const duplicate=structuredClone(currentControlPlane);
    duplicate.operations.push({...duplicate.operations[0]});
    duplicate.operationDigest=sha256(JSON.stringify(duplicate.operations));
    expect(()=>officialSdkOperations(duplicate)).toThrow(/duplicate/i);
    const map=inventory();
    map.currentControlPlane.sourceSha256='b'.repeat(64);
    expect(()=>validate(map)).toThrow(/SDK source pin/i);
    const map2=inventory();
    const newOnly=map2.rows.find(x=>x.origin==='official-sdk-reference');
    newOnly.ownerUnit='U-1';
    expect(()=>validate(map2)).toThrow(/SDK-only operation/i);
    const map3=inventory();
    map3.rows.find(x=>x.origin==='vendored-openapi').currentSdkState='present-but-magic';
    expect(()=>validate(map3)).toThrow(/current reference/i);
  });
  it('can reverify the full exact SDK source bytes offline, without provider credentials',()=>{
    const rawSpec={info:{version:'v2'},servers:[{url:'https://console.neon.tech/api/v2'}],
      paths:{'/things':{get:{operationId:'getThings',tags:['Things']}}}};
    const raw=JSON.stringify(rawSpec);
    const ref=fakeSdk([{method:'GET',path:'/things',operationId:'getThings',family:'Things'}]);
    ref.source.sha256=sha256(raw);
    expect(verifyOfficialSdkRaw(ref,raw)).toEqual({
      operations:1,sourceSha256:ref.source.sha256});
    expect(()=>verifyOfficialSdkRaw(ref,raw+' ')).toThrow(/SHA-256/i);
    const modified=structuredClone(ref);
    modified.operations[0].family='Different';
    modified.operationDigest=sha256(JSON.stringify(modified.operations));
    expect(()=>verifyOfficialSdkRaw(modified,raw)).toThrow(/projection/i);
  });
  it('refuses missing, orphan and duplicate rows, including crafted aliases',()=>{
    const a=inventory();a.rows.pop();expect(()=>validate(a)).toThrow(/missing|orphan/i);
    const b=inventory();b.rows.push({...b.rows[0],key:'foreign|GET|/private'});
    expect(()=>validate(b)).toThrow(/missing|orphan/i);
    const c=inventory();c.rows.push(structuredClone(c.rows[0]));
    expect(()=>validate(c)).toThrow(/duplicate/i);
  });
  it('refuses fabricated provider support, unsupported dispositions and host spoofing',()=>{
    const a=inventory();a.rows[0].credentials.project_api_key={status:'supported',
      evidence:null,scope:'all'};
    expect(()=>validate(a)).toThrow(/authority|credential/i);
    const b=inventory();b.rows[0].credentials.sql_login.status='magical';
    expect(()=>validate(b)).toThrow(/credential/i);
    const c=inventory();c.rows.find(x=>x.origin==='vendored-openapi').host='https://evil.test';
    expect(()=>validate(c)).toThrow(/source|host|reference/i);
    const d=inventory();d.rows[0].effect='everything';
    expect(()=>validate(d)).toThrow(/disposition/i);
    const e=inventory();e.rows.find(x=>x.origin==='vendored-openapi')
      .resourceSelectors=['wrong_resource'];
    expect(()=>validate(e)).toThrow(/selector/i);
    const f=inventory();f.rows.find(x=>x.origin==='vendored-openapi')
      .credentials.project_api_key={status:'supported',
        evidence:'https://neon.com/docs/manage/api-keys',scope:'all'};
    expect(()=>validate(f)).toThrow(/scope drift|credential/i);
  });
  it('refuses orphan tool handlers, forged live acceptance and unsupported source proof',()=>{
    const a=inventory(),candidate=a.rows.find(x=>x.source.candidates.length);
    candidate.source.candidates[0].candidateTools.push('neon_fake_super_admin');
    expect(()=>validate(a)).toThrow(/handler|source call site/i);
    const b=inventory();b.rows[0].live.status='verified';
    expect(()=>validate(b)).toThrow(/live proof/i);
    const c=inventory();c.rows[0].source.status='verified';
    expect(()=>validate(c)).toThrow(/execution/i);
    const d=inventory();d.rows.find(x=>x.origin==='documented-advanced-product')
      .providerReference='https://random.example/docs';
    expect(()=>validate(d)).toThrow(/advanced|interface/i);
  });
  it('attributes parsed provider operation calls to the correct handler, never adjacent tools',()=>{
    const source={'src/tools/fixture.js': `
      // projectRead(null,'getMagic') is only a comment.
      const note='getMagic';
      const common=()=>projectRead(null,'getBranch');
      export const handlers={
        async neon_a(){return projectRead(null,'getProject')},
        async neon_b(){return projectRead(null,'listProjects')},
        async neon_c(){return common()}
      };
      const write=()=>applyNeonWrite({operationId:'updateProject'});
    `};
    const refs=collectSourceOperationReferences(source,new Set(['neon_a','neon_b','neon_c']));
    expect(refs.has('getMagic')).toBe(false);
    expect(refs.get('getProject')).toMatchObject([{handler:'neon_a',via:'projectRead'}]);
    expect(refs.get('listProjects')).toMatchObject([{handler:'neon_b',via:'projectRead'}]);
    expect(refs.get('getBranch')).toMatchObject([{handler:null,via:'projectRead'}]);
    expect(refs.get('updateProject')).toMatchObject([{handler:null,via:'applyNeonWrite'}]);
    expect(()=>collectSourceOperationReferences({'src/tools/malformed.js':'function ('},new Set()))
      .toThrow();
  });
  it('prevents a nearby tool, a changed line, or a forged call from becoming coverage',()=>{
    const map=inventory();
    const candidate=map.rows.find(x=>x.source.candidates.some(c=>c.callSites.length));
    expect(candidate).toBeTruthy();
    const site=candidate.source.candidates[0].callSites[0];
    site.line+=1;
    expect(()=>validate(map)).toThrow(/source call site/i);
    const map2=inventory();
    const candidate2=map2.rows.find(x=>x.source.candidates.length);
    candidate2.source.candidates[0].candidateTools.push('neon_project_list');
    expect(()=>validate(map2)).toThrow(/source call site/i);
    const map3=inventory();
    const candidate3=map3.rows.find(x=>x.source.status==='candidate');
    candidate3.source.candidates=[];
    expect(()=>validate(map3)).toThrow(/source call site/i);
  });
  it('captures exact source request/response contracts and does not infer API-key permissions',()=>{
    const contracts=projectOpenApiContracts(spec);
    expect(contracts).toHaveLength(163);
    const project=projectOperationWire(spec,'/projects/{project_id}','PATCH');
    expect(project.request.required).toBe(true);
    expect(project.request.content[0].media).toBe('application/json');
    expect(project.request.content[0].schema.refs).toContain(
      '#/components/schemas/ProjectUpdateRequest');
    expect(project.responses.some(x=>x.status==='200')).toBe(true);
    expect(project.securitySchemes).toContainEqual(['BearerAuth']);
    const map=inventory().rows.find(x=>x.operationId==='updateProject');
    expect(map.wire).toEqual(project);
    expect(map.credentials.personal_api_key.status).toBe('unknown');
    const official=inventory().rows.find(x=>x.operationId==='listNeonAuthOAuthClients');
    expect(official.origin).toBe('official-sdk-reference');
    expect(official.wire.responses.length).toBeGreaterThan(0);
    expect(official.live.status).toBe('unverified');
  });
  it('refuses forged published wire contracts, source drift, orphan parameters and missing refs',()=>{
    const altered=inventory();
    altered.rows.find(x=>x.origin==='vendored-openapi').wire.request.required=true;
    expect(()=>validate(altered)).toThrow(/wire schema/i);
    const swapped=inventory();
    swapped.rows.find(x=>x.wireState==='shared-wire-drift').currentWire=null;
    expect(()=>validate(swapped)).toThrow(/wire schema/i);
    const badSnapshot=structuredClone(officialWireSnapshot);
    badSnapshot.contracts[0].responses=[];
    expect(()=>validateOfficialWireSnapshot(currentControlPlane,badSnapshot)).toThrow(/digest/i);
    const forgedSummary=inventory();
    forgedSummary.wireContracts.sharedDeclaredDrift=0;
    expect(()=>validate(forgedSummary)).toThrow(/wire contract/i);
    const badSpec={paths:{'/widgets/{widget_id}':{get:{
      operationId:'getWidget',parameters:[{name:'not_in_path',in:'path',
        required:true,schema:{type:'string'}}]}}}};
    expect(()=>projectOperationWire(badSpec,'/widgets/{widget_id}','GET'))
      .toThrow(/Orphan OpenAPI path parameter/i);
    const duplicates={paths:{'/widgets':{get:{operationId:'getWidgets',
      parameters:[{name:'cursor',in:'query',schema:{type:'string'}},
        {name:'cursor',in:'query',schema:{type:'string'}}]}}}};
    expect(()=>projectOpenApiContracts(duplicates)).toThrow(/Duplicate operation/i);
    const refSpec={paths:{'/widgets':{get:{operationId:'getWidgets',
      responses:{'200':{content:{'application/json':{
        schema:{$ref:'#/components/schemas/Missing'}}}}}}}}};
    expect(()=>projectOpenApiContracts(refSpec)).toThrow(/Missing local OpenAPI reference/i);
    const fakeSpec={info:{version:'v2'},
      servers:[{url:'https://console.neon.tech/api/v2'}],
      paths:{'/widgets':{get:{operationId:'getWidgets',responses:{'200':{description:'OK'}}}}}};
    const raw=JSON.stringify(fakeSpec);
    const ref=fakeSdk([{method:'GET',path:'/widgets',operationId:'getWidgets',family:'Widget'}]);
    ref.source.sha256=sha256(raw);
    const snapshot=fakeWireSnapshot(ref);
    expect(verifiedOfficialWireRaw(ref,snapshot,raw)).toMatchObject({operations:1});
    expect(()=>verifiedOfficialWireRaw(ref,snapshot,raw+' ')).toThrow(/checksum/i);
  });
  it('pins the installed SDK raw export and actual guarded fallback source separately',()=>{
    const map=inventory();
    const absent=map.rows.filter(x=>x.sdkDispatch?.genericClientState==='no-dispatch-path');
    expect(absent).toHaveLength(14);
    const aliases=map.rows.filter(x=>
      x.sdkDispatch?.genericClientState==='case-alias-export');
    expect(aliases).toHaveLength(17);
    expect(aliases.find(x=>x.operationId==='getConnectionURI')?.sdkDispatch.rawAlias)
      .toBe('getConnectionUri');
    expect(aliases.find(x=>x.operationId==='createProjectBranchDataAPI')?.sdkDispatch.rawAlias)
      .toBe('createProjectBranchDataApi');
    expect(absent.some(x=>x.operationId==='listNeonAuthOAuthClients')).toBe(true);
    const fake=structuredClone(map);
    fake.rows.find(x=>x.operationId==='listNeonAuthOAuthClients').sdkDispatch.rawExport=true;
    expect(()=>validate(fake)).toThrow(/SDK raw export/i);
    const fake2=structuredClone(map);
    fake2.sdkDispatch.withoutGenericDispatch=0;
    expect(()=>validate(fake2)).toThrow(/dispatch denominator/i);
    const fallback=collectDeclaredSdkFallbacks(clientSource);
    expect(fallback.get('getProjectJWKS').flag).toBe('jwksRead');
    expect(fallback.get('recoverProjectBranch').flag).toBe('recoverBranch');
    const disguised="// const foo=operationId === 'fake' && typeof raw.fake !== 'function';";
    expect(collectDeclaredSdkFallbacks(disguised).has('fake')).toBe(false);
    expect(()=>validateCapabilityInventory({inventory:map,spec,sourcePin,registry,
      productSurfaces,currentControlPlane,sourceFiles,sdkRawOperationNames,
      clientSource:clientSource.replace("typeof raw.getProjectJWKS !== 'function'","false"),
      sdkVersion,officialWireSnapshot}))
      .toThrow(/SDK raw export/i);
  });
  it('refuses a malformed or undocumented newer product row',()=>{
    const fakeSpec={info:{version:'v2'},servers:[{url:'https://console.neon.tech/api/v2'}],
      paths:{'/widgets':{get:{operationId:'getWidgets',tags:['Widget']}}}};
    const fakeRegistry={tools:[{name:'neon_widgets'}],
      handlers:{neon_widgets:()=>({})}};
    const fakeProducts={operations:[{key:'example:read',family:'example',
      protocol:'https',method:'GET',path:'/example',host:'https://example.test',
      version:'unverified',reference:'https://neon.com/docs/example',
      access:'unknown',effect:'read',authority:'unknown'}]};
    const fakeCurrent=fakeSdk([{method:'GET',path:'/widgets',
      operationId:'getWidgets',family:'Widget'}]);
    const found=buildCapabilityInventory({
      spec:fakeSpec,sourcePin,registry:fakeRegistry,productSurfaces:fakeProducts,
      currentControlPlane:fakeCurrent,      officialWireSnapshot:fakeWireSnapshot(fakeCurrent),
      checkedDate:'2026-11-03',sdkRawOperationNames:['getWidgets'],
      sdkVersion:'7.0.1',clientSource:"export const NEON_SDK_VERSION = '7.0.1';",sourceFiles:{
        'src/tools/widgets.js':"export const handlers={async neon_widgets(){return projectRead(null,'getWidgets')}};"
      },testFiles:{}});
    expect(found.rows).toHaveLength(2);
    expect(found.rows.find(x=>x.operationId==='getWidgets').source.status).toBe('candidate');
    validateCapabilityInventory({inventory:found,spec:fakeSpec,sourcePin,
      registry:fakeRegistry,productSurfaces:fakeProducts,currentControlPlane:fakeCurrent,
      sdkRawOperationNames:['getWidgets'],sdkVersion:'7.0.1',
      clientSource:"export const NEON_SDK_VERSION = '7.0.1';",
      officialWireSnapshot:fakeWireSnapshot(fakeCurrent),
    sourceFiles:{'src/tools/widgets.js':"export const handlers={async neon_widgets(){return projectRead(null,'getWidgets')}};"}});
    found.rows.find(x=>x.operationId==='example:read').providerDocumentationState='unknown';
    expect(()=>validateCapabilityInventory({inventory:found,spec:fakeSpec,sourcePin,
      registry:fakeRegistry,productSurfaces:fakeProducts,
      currentControlPlane:fakeCurrent})).toThrow();
  });
  it('has reproducible family denominators and no invented percentages',()=>{
    const map=inventory(),gaps=capabilityGapReport(map);
    expect(gaps.reduce((sum,x)=>sum+x.operations,0)).toBe(209);
    const report=formatCapabilityGapReport(map);
    expect(report).toContain('Object Storage');
    expect(report).toContain('163 unique operations');
    expect(report).toContain('193 unique operations');
    expect(report).toContain('31 SDK-only methods');
    expect(report).toContain('17 shared method/path contracts differ');
    expect(report).toContain('14 have no generic client dispatch route');
    expect(report).toContain('1 pinned-only methods');
    expect(report).not.toMatch(/[0-9]+(?:\.[0-9]+)?%/);
  });
  it('enforces checked generated outputs and does not contact provider',()=>{
    expect(runCoverage('--check')).toEqual({
      checked:true,api:163,sdk:193,sdkNew:31,sdkOld:1,advanced:15,
      tools:registry.tools.length,
      sdkDispatch:{version:'7.0.1',total:194,rawExport:159,
        fallbackOnly:4,aliasedExport:17,withoutGenericDispatch:14}});
  });
});
