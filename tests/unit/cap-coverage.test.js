import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {registry} from '../../src/tools/index.js';
import {generateCoverage,runCoverage} from '../../scripts/cap-coverage.mjs';
import {pinnedOperations,verifiedSourcePin,buildCapabilityInventory,
  validateCapabilityInventory,capabilityGapReport,formatCapabilityGapReport
} from '../../src/core/cap-coverage.js';

const spec=parse(readFileSync('vendor/neon-openapi/v2.yaml','utf8'));
const specText=readFileSync('vendor/neon-openapi/v2.yaml','utf8');
const sourceText=readFileSync('vendor/neon-openapi/SOURCE.md','utf8');
const productSurfaces=JSON.parse(readFileSync('docs/capabilities/neon-product-surfaces.json','utf8'));
const sourcePin=verifiedSourcePin({specText,sourceText});
function inventory(){return structuredClone(generateCoverage().inventory);}
function validate(x){return validateCapabilityInventory({
  inventory:x,spec,sourcePin,registry,productSurfaces});}
describe('CAP-1 complete but conservative operation inventory',()=>{
  it('checks all pinned real API methods with their exact source hash and distinct newer products',()=>{
    const map=inventory(),expected=pinnedOperations(spec);
    expect(expected).toHaveLength(163);
    expect(map.controlPlane.sha256).toBe(sourcePin.sha256);
    expect(map.externalSurfaces.count).toBe(15);
    expect(map.registry.registeredTools).toBe(registry.tools.length);
    expect(map.rows).toHaveLength(178);
    expect(validate(map)).toEqual({controlPlane:163,advanced:15,total:178});
    expect(map.rows.map(x=>x.key)).toEqual([...new Set(map.rows.map(x=>x.key))].sort((a,b)=>a.localeCompare(b)));
  });
  it('keeps real operation references distinct from verified execution and live proof',()=>{
    const map=inventory();
    expect(map.rows.filter(x=>x.source.status==='candidate').length).toBeGreaterThan(1);
    expect(map.rows.every(x=>!x.source.guardedExecutionVerified)).toBe(true);
    expect(map.rows.every(x=>x.live.status==='unverified')).toBe(true);
    expect(map.rows.some(x=>x.origin==='documented-advanced-product'&&
      x.family==='object_storage')).toBe(true);
    const storage=map.rows.find(x=>x.operationId==='object-storage:put');
    expect(storage.credentials.product_scoped_credential.status).toBe('supported');
    expect(storage.requiredPermissions).toBe('storage:write');
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
    expect(()=>validate(c)).toThrow(/source|host/i);
    const d=inventory();d.rows[0].effect='everything';
    expect(()=>validate(d)).toThrow(/disposition/i);
  });
  it('refuses orphan tool handlers, forged live acceptance and unsupported source proof',()=>{
    const a=inventory(),candidate=a.rows.find(x=>x.source.candidates.length);
    candidate.source.candidates[0].candidateTools.push('neon_fake_super_admin');
    expect(()=>validate(a)).toThrow(/handler/i);
    const b=inventory();b.rows[0].live.status='verified';
    expect(()=>validate(b)).toThrow(/live proof/i);
    const c=inventory();c.rows[0].source.status='verified';
    expect(()=>validate(c)).toThrow(/execution/i);
    const d=inventory();d.rows.find(x=>x.origin==='documented-advanced-product')
      .providerReference='https://random.example/docs';
    expect(()=>validate(d)).toThrow(/advanced|interface/i);
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
    const found=buildCapabilityInventory({
      spec:fakeSpec,sourcePin,registry:fakeRegistry,productSurfaces:fakeProducts,
      checkedDate:'2026-11-03',sourceFiles:{
        'src/tools/widgets.js':"export const tools=[{name:'neon_widgets'}]; const x='getWidgets';"
      },testFiles:{}});
    expect(found.rows).toHaveLength(2);
    expect(found.rows.find(x=>x.operationId==='getWidgets').source.status).toBe('candidate');
    validateCapabilityInventory({inventory:found,spec:fakeSpec,sourcePin,
      registry:fakeRegistry,productSurfaces:fakeProducts});
    found.rows.find(x=>x.operationId==='example:read').providerDocumentationState='unknown';
    expect(()=>validateCapabilityInventory({inventory:found,spec:fakeSpec,sourcePin,
      registry:fakeRegistry,productSurfaces:fakeProducts})).toThrow();
  });
  it('has reproducible family denominators and no invented percentages',()=>{
    const map=inventory(),gaps=capabilityGapReport(map);
    expect(gaps.reduce((sum,x)=>sum+x.operations,0)).toBe(178);
    const report=formatCapabilityGapReport(map);
    expect(report).toContain('Object Storage');
    expect(report).toContain('163 unique operations');
    expect(report).not.toMatch(/[0-9]+(?:\.[0-9]+)?%/);
  });
  it('enforces checked generated outputs and does not contact provider',()=>{
    expect(runCoverage('--check')).toEqual({checked:true,api:163,advanced:15,
      tools:registry.tools.length});
  });
});
