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
const sdkKey=x=>'sdk|'+x.version+'|'+x.method+'|'+x.path;
const signature=x=>x.method+' '+x.path;
const rawSdkUrl=revision=>
  'https://raw.githubusercontent.com/neondatabase/neon-pkgs/'+revision+
  '/packages/sdk/spec/neon-openapi.json';
const methods=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);

// A dated, official SDK OpenAPI snapshot is a reference, NOT a replacement
// for the runtime-vendored API or evidence of a live Neon permission.
export function officialSdkOperations(reference){
  const source=reference?.source;
  if(reference?.schemaVersion!==1||!defined(reference.version)||
     !defined(reference.host)||!reference.host.startsWith('https://')||
     !Array.isArray(reference.operations)||
     !/^[a-f0-9]{40}$/.test(source?.revision||'')||
     source?.repository!=='neondatabase/neon-pkgs'||
     source?.path!=='packages/sdk/spec/neon-openapi.json'||
     source?.url!==rawSdkUrl(source.revision)||
     !/^[a-f0-9]{64}$/.test(source?.sha256||'')||
     !/^[a-f0-9]{64}$/.test(reference.operationDigest||'')||
     sha256(JSON.stringify(reference.operations))!==reference.operationDigest)
    throw new TypeError('Official SDK source provenance or snapshot digest invalid');
  const ids=new Set(),keys=new Set(),rows=[];
  for(const x of reference.operations){
    if(!isObject(x)||!methods.has(x.method)||!defined(x.path)||
       !x.path.startsWith('/')||!defined(x.operationId)||!defined(x.family))
      throw new TypeError('Malformed SDK API method');
    const key=sdkKey({...x,version:reference.version});
    if(ids.has(x.operationId)||keys.has(key))
      throw new TypeError('Duplicate SDK operation or operation ID');
    ids.add(x.operationId);keys.add(key);
    rows.push({...x,version:reference.version,key});
  }
  if(JSON.stringify([...keys])!==JSON.stringify([...keys].sort()))
    throw new TypeError('SDK operation signatures not in canonical order');
  return rows;
}

// This optional offline verifier checks the SHA-pinned *full* upstream bytes;
// normal CI never downloads provider metadata and uses only the checked snapshot.
export function verifyOfficialSdkRaw(reference,raw){
  officialSdkOperations(reference);
  if(sha256(raw)!==reference.source.sha256)
    throw new TypeError('Official SDK full OpenAPI SHA-256 mismatch');
  const spec=JSON.parse(raw);
  if(spec.info?.version!==reference.version||
     spec.servers?.[0]?.url!==reference.host)
    throw new TypeError('Official SDK version or host drift');
  const actual=[];
  for(const [path,entries] of Object.entries(spec.paths||{}))
    for(const [method,operation] of Object.entries(entries))
      if(methods.has(method.toUpperCase())&&method===method.toLowerCase())
        actual.push({method:method.toUpperCase(),path,
          operationId:operation.operationId,
          family:operation.tags?.[0]||'unclassified'});
  actual.sort((a,b)=>signature(a)<signature(b)?-1:signature(a)>signature(b)?1:0);
  if(JSON.stringify(actual)!==JSON.stringify(reference.operations))
    throw new TypeError('Official SDK projection differs from checked snapshot');
  return {operations:actual.length,sourceSha256:reference.source.sha256};
}

// Existing original-card owners are only source routing, not acceptance.
function ownerFor(op){
  const p=op.path||'',f=op.family;
  if(p.includes('/members')||p.includes('/invitations'))return 'O-1';
  if(p.includes('/data-api')||p.includes('/auth'))return 'E-1';
  if(p.includes('/functions')||p.includes('/triggers')||
     p.includes('/storage')||p.includes('/buckets'))return 'E-2';
  if(p.includes('/snapshots')||p.includes('/restore'))return 'D-7';
  if(p.includes('/databases')||p.includes('/roles'))return 'D-4';
  if(p.includes('/endpoints'))return 'D-3';
  if(p.includes('/keys')||f==='API Key')return 'O-2';
  if(f==='Consumption')return 'O-3';
  if(f==='Functions'||f==='Buckets'||f==='Storage')return 'E-2';
  if(f==='Auth'||f==='Auth (legacy)'||f==='DataAPI')return 'E-1';
  if(f==='Organizations'||f==='Users')return 'O-1';
  if(f==='Project'||f==='Operation'||f==='Region')return 'D-1';
  if(f==='Branch')return 'D-2';
  if(f==='Endpoint')return 'D-3';
  if(f==='Snapshot')return 'D-7';
  if(f==='Credentials')return 'CAP-3';
  if(f==='Logs')return 'O-4';
  return 'CAP-4'; // New provider surfaces need original-card reconciliation.
}

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
  registry,productSurfaces,currentControlPlane,checkedDate}={}){
  if(!defined(checkedDate)||!isObject(sourcePin)||!Array.isArray(registry?.tools)||
      !isObject(registry?.handlers)||!Array.isArray(productSurfaces?.operations))
    throw new TypeError('CAP-1 sources, registry and product list required');
  const known=new Set(registry.tools.map(t=>t.name));
  if(known.size!==registry.tools.length||
     registry.tools.some(t=>typeof registry.handlers[t.name]!=='function'))
    throw new TypeError('Tool registry invalid');
  const api=pinnedOperations(spec),host=spec.servers[0].url;
  const sdk=officialSdkOperations(currentControlPlane);
  if(currentControlPlane.version!==spec.info.version||
     currentControlPlane.host!==host)
    throw new TypeError('SDK and runtime OpenAPI are different control planes');
  const bySignature=new Map(api.map(x=>[signature(x),x]));
  const sdkBySignature=new Map(sdk.map(x=>[signature(x),x]));
  const changed=sdk.filter(x=>bySignature.has(signature(x))&&
    bySignature.get(signature(x)).operationId!==x.operationId);
  if(changed.length)
    throw new TypeError('SDK operation ID changes require explicit reconciliation');
  const newSdk=sdk.filter(x=>!bySignature.has(signature(x)));
  const pinnedOnly=api.filter(x=>!sdkBySignature.has(signature(x)));
  const rows=api.map(op=>{
    const hits=candidates(op.operationId,sourceFiles,known);
    return {...op,origin:'vendored-openapi',host,providerSourceSha:sourcePin.sha256,
      sourceCheckedDate:checkedDate,effect:op.method==='GET'?'read':
        op.method==='DELETE'?'destructive':'write',
      credentials:credentials('api'),requiredPermissions:'unknown',entitlement:'unknown',
      resourceSelectors:unique([...op.path.matchAll(/\{([^}]+)\}/g)].map(m=>m[1])),
      currentSdkState:sdkBySignature.has(signature(op))?'present':'not-in-sdk-reference',
      ownerUnit:ownerFor(op),
      ownerUnitEvidence:'Source family/path routed to existing card; direct acceptance unverified',
      source:{status:hits.length?'candidate':'missing',candidates:hits,
        tests:Object.keys(testFiles).filter(p=>references(testFiles[p],op.operationId)).sort(),
        guardedExecutionVerified:false},live:{status:'unverified',evidence:null}};
  });
  for(const op of newSdk){
    const hits=candidates(op.operationId,sourceFiles,known);
    rows.push({...op,origin:'official-sdk-reference',host,
      providerSourceSha:currentControlPlane.source.sha256,
      sourceCheckedDate:checkedDate,
      effect:op.method==='GET'?'read':op.method==='DELETE'?'destructive':'write',
      currentSdkState:'new-in-sdk-reference',credentials:credentials('api'),
      requiredPermissions:'unknown',entitlement:'unknown',
      resourceSelectors:unique([...op.path.matchAll(/\{([^}]+)\}/g)].map(m=>m[1])),
      ownerUnit:ownerFor(op),
      ownerUnitEvidence:'Official SDK source route; per-operation permission and engineering unverified',
      source:{status:hits.length?'candidate':'missing',candidates:hits,
        tests:Object.keys(testFiles).filter(p=>references(testFiles[p],op.operationId)).sort(),
        guardedExecutionVerified:false},
      live:{status:'unverified',evidence:null}});
  }
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
  return {schemaVersion:2,checkedDate,currentControlPlane:{
    version:currentControlPlane.version,host:currentControlPlane.host,
    source:currentControlPlane.source.url,
    revision:currentControlPlane.source.revision,
    sourceSha256:currentControlPlane.source.sha256,
    operationDigest:currentControlPlane.operationDigest,
    expectedOperations:sdk.length,newToPinned:newSdk.length,
    pinnedOnly:pinnedOnly.length,shared:api.length-pinnedOnly.length},
    controlPlane:{version:spec.info.version,
    host,source:sourcePin.source,sha256:sourcePin.sha256,expectedOperations:api.length},
    externalSurfaces:{count:productSurfaces.operations.length,
      sourceStatus:'Official docs; advanced wire and version not pinned'},
    registry:{registeredTools:registry.tools.length},
    rows:rows.sort((a,b)=>a.key.localeCompare(b.key))};
}

export function validateCapabilityInventory({inventory,spec,sourcePin,registry,productSurfaces,currentControlPlane}={}){
  if(!isObject(inventory)||!Array.isArray(inventory.rows)||
     !Array.isArray(productSurfaces?.operations))throw new TypeError('Inventory and sources required');
  if(inventory.schemaVersion!==2)throw new TypeError('CAP-1 inventory schema version drift');
  const control=pinnedOperations(spec),sdk=officialSdkOperations(currentControlPlane);
  const controlBySignature=new Map(control.map(x=>[signature(x),x]));
  const sdkBySignature=new Map(sdk.map(x=>[signature(x),x]));
  const added=sdk.filter(x=>!controlBySignature.has(signature(x)));
  const removed=control.filter(x=>!sdkBySignature.has(signature(x)));
  if(sdk.some(x=>controlBySignature.has(signature(x))&&
     x.operationId!==controlBySignature.get(signature(x)).operationId))
    throw new TypeError('SDK operation ID conflict');
  const expected=control.map(x=>x.key).concat(added.map(x=>x.key),
    productSurfaces.operations.map(extraKey)).sort();
  const keys=inventory.rows.map(row=>row.key);
  if(new Set(keys).size!==keys.length)throw new TypeError('Duplicate inventory row');
  if(JSON.stringify([...keys].sort())!==JSON.stringify(expected))
    throw new TypeError('Missing or orphan inventory operation');
  if(inventory.controlPlane?.sha256!==sourcePin.sha256||
     inventory.controlPlane?.expectedOperations!==control.length||
     inventory.controlPlane?.host!==spec.servers[0].url)
    throw new TypeError('Control-plane source pin, host or denominator drift');
  if(inventory.currentControlPlane?.expectedOperations!==sdk.length||
     inventory.currentControlPlane?.newToPinned!==added.length||
     inventory.currentControlPlane?.pinnedOnly!==removed.length||
     inventory.currentControlPlane?.shared!==control.length-removed.length||
     inventory.currentControlPlane?.sourceSha256!==currentControlPlane.source.sha256||
     inventory.currentControlPlane?.operationDigest!==currentControlPlane.operationDigest||
     inventory.currentControlPlane?.revision!==currentControlPlane.source.revision||
     inventory.currentControlPlane?.source!==currentControlPlane.source.url||
     inventory.currentControlPlane?.host!==currentControlPlane.host||
     inventory.currentControlPlane?.version!==currentControlPlane.version)
    throw new TypeError('Official SDK source pin or coverage drift');
  if(inventory.externalSurfaces?.count!==productSurfaces.operations.length||
     inventory.registry?.registeredTools!==registry.tools.length)
    throw new TypeError('Provider surface or registry denominator drift');
  const names=new Set(registry.tools.map(t=>t.name));
  const controlMap=new Map(control.map(op=>[op.key,op]));
  const productMap=new Map(productSurfaces.operations.map(x=>[extraKey(x),x]));
  const addedMap=new Map(added.map(x=>[x.key,x]));
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
         row.host!==spec.servers[0].url||
         row.currentSdkState!==(sdkBySignature.has(signature(schema))?
           'present':'not-in-sdk-reference')||
         row.ownerUnit!==ownerFor(schema))
        throw new TypeError('OpenAPI operation, current reference or owner has drifted: '+row.key);
    }else if(row.origin==='official-sdk-reference'){
      const original=addedMap.get(row.key);
      if(!original||row.operationId!==original.operationId||
         row.path!==original.path||row.method!==original.method||
         row.family!==original.family||row.version!==currentControlPlane.version||
         row.host!==currentControlPlane.host||
         row.providerSourceSha!==currentControlPlane.source.sha256||
         row.currentSdkState!=='new-in-sdk-reference'||
         row.ownerUnit!==ownerFor(original))
        throw new TypeError('Official SDK-only operation or owner has drifted: '+row.key);
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
    const expectedCredentialMatrix=row.origin==='documented-advanced-product'?
      credentials('advanced',productMap.get(row.key)?.reference,
        productMap.get(row.key)?.access):credentials('api');
    if(JSON.stringify(row.credentials)!==JSON.stringify(expectedCredentialMatrix))
      throw new TypeError('Credential source evidence or scope drift: '+row.key);
    if(row.origin!=='documented-advanced-product'){
      const selectors=unique([...row.path.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]));
      if(JSON.stringify(row.resourceSelectors)!==JSON.stringify(selectors))
        throw new TypeError('Operation resource selector drift: '+row.key);
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
  return {controlPlane:control.length,currentControlPlane:sdk.length,
    newSdkOperations:added.length,pinnedOnly:removed.length,
    advanced:productSurfaces.operations.length,total:inventory.rows.length};
}
export function capabilityGapReport(inventory){
  const groups=new Map();
  for(const row of inventory.rows){
    const prefix=row.origin==='vendored-openapi'?'api/':
      row.origin==='official-sdk-reference'?'sdk-new/':'advanced/';
    const family=prefix+row.family;
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
    '- Runtime-vendored OpenAPI SHA-256: '+inventory.controlPlane.sha256+'.',
    '- Commit-pinned official Neon SDK API: '+inventory.currentControlPlane.expectedOperations+
      ' unique operations at revision '+inventory.currentControlPlane.revision+
      ' (full upstream SHA-256 '+inventory.currentControlPlane.sourceSha256+').',
    '- Compared with runtime-vendored API: '+
      inventory.currentControlPlane.newToPinned+' SDK-only methods, '+
      inventory.currentControlPlane.pinnedOnly+' pinned-only methods, '+
      inventory.currentControlPlane.shared+' shared signatures; method names were checked for drift.',
    '- SDK source is a dated published contract, not evidence that each method is live or authorized.',
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
  lines.push('','## Official SDK-only control-plane operations (explicit gaps)','',
    'These methods appear in the dated official SDK OpenAPI but not in the runtime-vendored schema.',
    'No SDK-only method is reported as executable, provider-authorized or released without separate evidence.','',
    '| Method | Path | Operation ID | Existing-card route | Source state |',
    '| --- | --- | --- | --- | --- |');
  for(const row of inventory.rows.filter(x=>x.origin==='official-sdk-reference'))
    lines.push('| '+row.method+' | '+row.path+' | '+row.operationId+' | '+
      row.ownerUnit+' | '+row.source.status+' |');
  lines.push('','## Pinned-only methods requiring provider reconciliation','',
    'Absence from the official SDK snapshot does NOT by itself establish a retired live API.','',
    '| Method | Path | Operation ID | Source state |',
    '| --- | --- | --- | --- |');
  for(const row of inventory.rows.filter(x=>x.origin==='vendored-openapi'&&
    x.currentSdkState==='not-in-sdk-reference'))
    lines.push('| '+row.method+' | '+row.path+' | '+row.operationId+
      ' | '+row.source.status+' |');
  lines.push('','## Other-host product workflow uncertainties','',
    '| Product workflow | Protocol / method | Host or target | Authority state |',
    '| --- | --- | --- | --- |');
  for(const row of inventory.rows.filter(x=>x.origin==='documented-advanced-product'))
    lines.push('| '+row.operationId+' | '+row.protocol+' / '+row.method+
      ' | '+row.host+' | '+row.requiredPermissions+' (unverified runtime) |');
  lines.push('','## Explicit exclusions and required follow-up','',
    '- Runtime OpenAPI remains the pinned July 2026 contract; the official SDK snapshot is read-only comparison, not re-vendored runtime source or a live API probe.',
    '- The SDK-reference-only family rows lack verified handlers/credentials/provider reads; do not treat SDK exposure as MCP feature availability.',
    '- Advanced Functions, Object Storage, Data API, Auth, SQL and AI Gateway methods come from official product docs, not pinned wire specs. Unsupported or unverified method/host/permission fields remain labeled unknown.',
    '- API keys, SQL role credentials and product-scoped tokens are different credential types; never substitute one for another.',
    '- HTTP method effect labels are conservative, not measured prices, authorization or permission to execute.',
    '- Original owner routing is derived from documented path/family and remains provisional; each existing card and tested handler requires direct reconciliation.',
    '- No fabricated percentage or live parity is computed while authorization routing, guards, readback and client/provider acceptance are unproven.',
    '');
  return lines.join('\n');
}
