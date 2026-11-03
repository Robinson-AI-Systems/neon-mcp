// CAP-1 — conservative source inventory; references are not execution proof.
import {createHash} from 'node:crypto';
export const CREDENTIAL_KINDS=['personal_api_key','organization_api_key','project_api_key','sql_login','delegated_oauth','product_scoped_credential'];
const states=new Set(['unknown','supported','unsupported']);
const effects=new Set(['read','write','destructive','costed-unknown','unknown']);
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const defined=x=>typeof x==='string'&&x.trim().length>0;
const unique=a=>[...new Set(a)].sort();
export const sha256=x=>createHash('sha256').update(x).digest('hex');
const apiKey=(m,p,v)=>['api',v,m.toUpperCase(),p].join('|');
const extraKey=x=>'advanced|'+x.key+'|'+x.version;

export function pinnedOperations(spec){
  if(!isObject(spec)||!isObject(spec.paths)||!defined(spec.info?.version)||
     !defined(spec.servers?.[0]?.url)||!spec.servers[0].url.startsWith('https://'))
    throw new TypeError('Versioned HTTPS OpenAPI is required');
  const rows=[],keys=new Set(),ids=new Set();
  for(const [path,methods] of Object.entries(spec.paths)){
    if(!path.startsWith('/')||!isObject(methods))throw new TypeError('Invalid API path');
    for(const method of ['get','post','put','patch','delete','head','options']){
      const op=methods[method];if(!op)continue;
      if(!defined(op.operationId))throw new TypeError('Unnamed API method');
      const key=apiKey(method,path,spec.info.version);
      if(keys.has(key)||ids.has(op.operationId))throw new TypeError('Duplicate API method or operationId');
      keys.add(key);ids.add(op.operationId);
      rows.push({key,operationId:op.operationId,path,method:method.toUpperCase(),
        version:spec.info.version,family:op.tags?.[0]||'unclassified',
        security:op.security??spec.security??null});
    }
  }
  return rows.sort((a,b)=>a.key.localeCompare(b.key));
}
export function verifiedSourcePin({specText,sourceText}){
  const match=/\|\s*SHA-256\s*\|\s*\x60([a-f0-9]{64})\x60\s*\|/.exec(sourceText||'');
  const source=/\|\s*Source used[^|]*\|\s*([^|\n]+)\|/.exec(sourceText||'');
  if(!match||!source||sha256(specText)!==match[1])
    throw new TypeError('Pinned OpenAPI source hash/provenance mismatch');
  return {sha256:match[1],source:source[1].trim()};
}
function credentials(kind,reference,access){
  const all=Object.fromEntries(CREDENTIAL_KINDS.map(name=>[name,
    {status:'unknown',evidence:null,scope:'unverified'}]));
  if(kind==='api'){
    all.sql_login={status:'unsupported',evidence:'https://neon.com/docs/connect/connect-intro',
      scope:'SQL login does not authenticate control-plane REST'};
  }else if(access==='scoped-credential'){
    all.product_scoped_credential={status:'supported',evidence:reference,
      scope:'Verified branch- and permission-scoped credential required'};
  }else if(access==='database-credentials'){
    all.sql_login={status:'supported',evidence:reference,scope:'Postgres role grants only'};
    for(const name of CREDENTIAL_KINDS.slice(0,3))
      all[name]={status:'unsupported',evidence:reference,
        scope:'Platform API key is not a Postgres role password'};
  }
  return all;
}
const references=(text,id)=>text.includes("'"+id+"'")||text.includes('"'+id+'"');
function candidates(id,files,toolNames){
  const hits=[];
  for(const [path,text] of Object.entries(files)){
    if(!/^src\/tools\/[^/]+\.js$/.test(path)||!references(text,id))continue;
    hits.push({path,candidateTools:unique((text.match(/\bneon_[a-z0-9_]+\b/g)||[])
      .filter(name=>toolNames.has(name))),proof:'source_reference_not_executed'});
  }
  return hits.sort((a,b)=>a.path.localeCompare(b.path));
}
export function buildCapabilityInventory({spec,sourcePin,sourceFiles={},testFiles={},
  registry,productSurfaces,checkedDate}={}){
  if(!defined(checkedDate)||!isObject(sourcePin)||!Array.isArray(registry?.tools)||
      !isObject(registry?.handlers)||!Array.isArray(productSurfaces?.operations))
    throw new TypeError('CAP-1 sources, registry and product list required');
  const known=new Set(registry.tools.map(t=>t.name));
  if(known.size!==registry.tools.length||
     registry.tools.some(t=>typeof registry.handlers[t.name]!=='function'))
    throw new TypeError('Tool registry invalid');
  const api=pinnedOperations(spec),host=spec.servers[0].url;
  const rows=api.map(op=>{
    const hits=candidates(op.operationId,sourceFiles,known);
    return {...op,origin:'vendored-openapi',host,providerSourceSha:sourcePin.sha256,
      sourceCheckedDate:checkedDate,effect:op.method==='GET'?'read':
        op.method==='DELETE'?'destructive':'write',
      credentials:credentials('api'),requiredPermissions:'unknown',entitlement:'unknown',
      resourceSelectors:unique([...op.path.matchAll(/\{([^}]+)\}/g)].map(m=>m[1])),
      ownerUnit:'U-1',ownerUnitEvidence:'Universal fallback; direct owner mapping needs audit',
      source:{status:hits.length?'candidate':'missing',candidates:hits,
        tests:Object.keys(testFiles).filter(p=>references(testFiles[p],op.operationId)).sort(),
        guardedExecutionVerified:false},live:{status:'unverified',evidence:null}};
  });
  for(const item of productSurfaces.operations)rows.push({
    key:extraKey(item),operationId:item.key,origin:'documented-advanced-product',
    family:item.family,method:item.method,path:item.path??null,
    protocol:item.protocol,host:item.host,version:item.version,
    providerReference:item.reference,providerDocumentationState:'documented',
    providerSourceSha:null,sourceCheckedDate:checkedDate,effect:item.effect,
    credentials:credentials('advanced',item.reference,item.access),
    requiredPermissions:item.authority,entitlement:'unknown',resourceSelectors:[],
    ownerUnit:'CAP-4',ownerUnitEvidence:'Reconcile direct original cards before adding capability',
    source:{status:'missing',candidates:[],tests:[],guardedExecutionVerified:false},
    live:{status:'unverified',evidence:null}
  });
  return {schemaVersion:1,checkedDate,controlPlane:{version:spec.info.version,
    host,source:sourcePin.source,sha256:sourcePin.sha256,expectedOperations:api.length},
    externalSurfaces:{count:productSurfaces.operations.length,
      sourceStatus:'Official docs; advanced wire and version not pinned'},
    registry:{registeredTools:registry.tools.length},
    rows:rows.sort((a,b)=>a.key.localeCompare(b.key))};
}

export function validateCapabilityInventory({inventory,spec,sourcePin,registry,productSurfaces}={}){
  if(!isObject(inventory)||!Array.isArray(inventory.rows)||
     !Array.isArray(productSurfaces?.operations))throw new TypeError('Inventory and sources required');
  const control=pinnedOperations(spec);
  const expected=control.map(x=>x.key).concat(productSurfaces.operations.map(extraKey)).sort();
  const keys=inventory.rows.map(row=>row.key);
  if(new Set(keys).size!==keys.length)throw new TypeError('Duplicate inventory row');
  if(JSON.stringify([...keys].sort())!==JSON.stringify(expected))
    throw new TypeError('Missing or orphan inventory operation');
  if(inventory.controlPlane?.sha256!==sourcePin.sha256||
     inventory.controlPlane?.expectedOperations!==control.length||
     inventory.controlPlane?.host!==spec.servers[0].url)
    throw new TypeError('Control-plane source pin, host or denominator drift');
  if(inventory.externalSurfaces?.count!==productSurfaces.operations.length||
     inventory.registry?.registeredTools!==registry.tools.length)
    throw new TypeError('Provider surface or registry denominator drift');
  const names=new Set(registry.tools.map(t=>t.name));
  const controlMap=new Map(control.map(op=>[op.key,op]));
  const productMap=new Map(productSurfaces.operations.map(x=>[extraKey(x),x]));
  for(const row of inventory.rows){
    if(!defined(row.method)||!defined(row.operationId)||!defined(row.family)||
       !defined(row.version)||!defined(row.host)||!defined(row.ownerUnit)||
       !defined(row.sourceCheckedDate)||!effects.has(row.effect)||
       !['missing','candidate','verified'].includes(row.source?.status)||
       !['unverified','verified','not_applicable'].includes(row.live?.status)||
       !isObject(row.credentials))throw new TypeError('Unknown row disposition: '+row.key);
    if(row.origin==='vendored-openapi'){
      const schema=controlMap.get(row.key);
      if(!schema||row.path!==schema.path||row.method!==schema.method||
         row.operationId!==schema.operationId||row.family!==schema.family||
         row.providerSourceSha!==sourcePin.sha256||
         row.host!==spec.servers[0].url)
        throw new TypeError('OpenAPI operation or source has drifted: '+row.key);
    }else if(row.origin==='documented-advanced-product'){
      const documented=productMap.get(row.key);
      if(!documented||row.operationId!==documented.key||
         row.method!==documented.method||row.path!==(documented.path??null)||
         row.host!==documented.host||row.effect!==documented.effect||
         row.family!==documented.family||
         row.providerReference!==documented.reference||
         row.providerDocumentationState!=='documented'||
         !row.providerReference.startsWith('https://neon.com/docs/'))
        throw new TypeError('Unverified or invented newer product interface: '+row.key);
    }else throw new TypeError('Unknown provider-origin disposition');
    if(row.live.status==='verified'&&!defined(row.live.evidence))
      throw new TypeError('Claimed live proof has no evidence: '+row.key);
    if(!Array.isArray(row.source.candidates)||!Array.isArray(row.source.tests)||
       typeof row.source.guardedExecutionVerified!=='boolean')
      throw new TypeError('Source evidence malformed: '+row.key);
    if(row.source.status==='verified'&&
       (!row.source.guardedExecutionVerified||!row.source.tests.length))
      throw new TypeError('Unproven guarded execution: '+row.key);
    if(row.source.status==='missing'&&row.source.candidates.length)
      throw new TypeError('Candidate source cannot be missing: '+row.key);
    for(const candidate of row.source.candidates){
      if(!/^src\/tools\/[^/]+\.js$/.test(candidate.path)||
         !Array.isArray(candidate.candidateTools)||
         candidate.candidateTools.some(name=>!names.has(name)||
           typeof registry.handlers[name]!=='function'))
        throw new TypeError('Orphan handler reference: '+row.key);
    }
    if(Object.keys(row.credentials).length!==CREDENTIAL_KINDS.length)
      throw new TypeError('Missing credential dimension: '+row.key);
    for(const name of CREDENTIAL_KINDS){
      const value=row.credentials[name];
      if(!isObject(value)||!states.has(value.status)||!defined(value.scope))
        throw new TypeError('Invalid credential disposition: '+row.key+'/'+name);
      if(value.status!=='unknown'&&
         (!defined(value.evidence)||!value.evidence.startsWith('https://')))
        throw new TypeError('Unsupported provider-authority claim: '+row.key+'/'+name);
      if(value.status==='unknown'&&value.evidence!==null)
        throw new TypeError('Unknown credential cannot imply proof: '+row.key+'/'+name);
    }
  }
  return {controlPlane:control.length,advanced:productSurfaces.operations.length,
    total:inventory.rows.length};
}
export function capabilityGapReport(inventory){
  const groups=new Map();
  for(const row of inventory.rows){
    const family=(row.origin==='vendored-openapi'?'api/':'advanced/')+row.family;
    const g=groups.get(family)??{family,operations:0,verifiedSource:0,
      candidateSource:0,missingSource:0,verifiedLive:0};
    g.operations++;
    if(row.source.guardedExecutionVerified)g.verifiedSource++;
    else if(row.source.status==='candidate')g.candidateSource++;
    else g.missingSource++;
    if(row.live.status==='verified')g.verifiedLive++;
    groups.set(family,g);
  }
  return [...groups.values()].sort((a,b)=>a.family.localeCompare(b.family));
}
export function formatCapabilityGapReport(inventory){
  const lines=[
    '# CAP-1 — Neon operation and credential coverage (generated)',
    '',
    'Source inventory checked '+inventory.checkedDate+'. This is source accounting, not proof of a live released server.',
    '',
    '- Pinned control-plane API: '+inventory.controlPlane.expectedOperations+
      ' unique operations, version '+inventory.controlPlane.version+'.',
    '- OpenAPI SHA-256: '+inventory.controlPlane.sha256+'.',
    '- Separately documented advanced product workflows: '+inventory.externalSurfaces.count+
      '; different protocols, hosts and unpinned wire interfaces are not control-plane parity.',
    '- Registered named MCP tools: '+inventory.registry.registeredTools+
      '; named-tool counts are not operation coverage.',
    '- Candidate source means a quoted operation ID appears in a tool module. It is not proof of guarded execution.',
    '- Live operation evidence remains unverified until tied to the exact checked deployed source and client.',
    '',
    '| Family | Operations | Verified source | Candidate source | Missing/unverified source | Live verified |',
    '| --- | ---: | ---: | ---: | ---: | ---: |'
  ];
  for(const g of capabilityGapReport(inventory))
    lines.push('| '+g.family+' | '+g.operations+' | '+g.verifiedSource+' | '+
      g.candidateSource+' | '+g.missingSource+' | '+g.verifiedLive+' |');
  lines.push('','## Explicit exclusions and required follow-up','',
    '- OpenAPI is the pinned July 2026 contract; newer live methods may be missing. Re-vendoring is a separate governed A-4 decision.',
    '- Advanced Functions, Object Storage, Data API, Auth, SQL and AI Gateway methods come from official product docs, not pinned wire specs. Unsupported or unverified method/host/permission fields remain labeled unknown.',
    '- API keys, SQL role credentials and product-scoped tokens are different credential types; never substitute one for another.',
    '- HTTP method effect labels are conservative, not measured prices, authorization or permission to execute.',
    '- Operation owner U-1 is a universal fallback pending reconciliation of direct tool cards; advanced work is assigned to CAP-4 subject to existing card ownership.',
    '- No fabricated percentage or live parity is computed while authorization routing, guards, readback and client/provider acceptance are unproven.',
    '');
  return lines.join('\n');
}
