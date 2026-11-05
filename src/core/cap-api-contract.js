// CAP-1: source-pinned OpenAPI request, response and auth *declarations*.
// Declared wire schemas are not proof of provider permissions or execution.
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const methods=new Set(['get','post','put','patch','delete','head','options']);
function local(spec,ref,trail=new Set()){
  if(typeof ref!=='string'||!ref.startsWith('#/components/')||
     trail.has(ref)||trail.size>8)throw new TypeError('Unresolvable local OpenAPI reference');
  let value=spec;
  for(const segment of ref.slice(2).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'))){
    if(!object(value)||!Object.hasOwn(value,segment))
      throw new TypeError('Missing local OpenAPI reference '+ref);
    value=value[segment];
  }
  if(!object(value))throw new TypeError('Invalid OpenAPI reference target');
  if(value.$ref)return local(spec,value.$ref,new Set([...trail,ref]));
  return value;
}
function references(spec,schema){
  const refs=new Set();
  let count=0;
  function visit(value,depth=0){
    if(!value||typeof value!=='object')return;
    if(depth>32||++count>15000)throw new TypeError('Unbounded OpenAPI schema');
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
    if(typeof value.$ref==='string'){
      // Validate reference even if its target is not expanded into user-facing output.
      local(spec,value.$ref);refs.add(value.$ref);
    }
    for(const [key,item] of Object.entries(value))
      if(key!=='example'&&key!=='examples'&&key!=='description'&&key!=='default')
        visit(item,depth+1);
  }
  visit(schema);
  return [...refs].sort();
}
function shape(spec,schema){
  if(!object(schema))return null;
  const target=schema.$ref?local(spec,schema.$ref):schema;
  return {digest:sha(JSON.stringify(schema)),
    refs:references(spec,schema),
    type:typeof target.type==='string'?target.type:null,
    required:Array.isArray(target.required)?[...target.required].sort():[],
    fields:object(target.properties)?Object.keys(target.properties).sort():[]};
}
function parameter(spec,input){
  const value=input?.$ref?local(spec,input.$ref):input;
  if(!object(value)||typeof value.name!=='string'||typeof value.in!=='string'||
     !['path','query','header','cookie'].includes(value.in))
    throw new TypeError('Invalid OpenAPI parameter');
  return {name:value.name,in:value.in,required:value.required===true||value.in==='path',
    schema:shape(spec,value.schema),
    sourceRef:input.$ref??null};
}
function content(spec,record){
  if(!object(record))return [];
  return Object.entries(record.content??{}).sort(([a],[b])=>a.localeCompare(b))
    .map(([media,body])=>({media,schema:shape(spec,body?.schema)}));
}
function resolver(spec,input){
  if(input?.$ref)return local(spec,input.$ref);
  return input;
}
export function projectOperationWire(spec,path,method){
  if(!object(spec)||!object(spec.paths)||typeof path!=='string'||
     !methods.has(method.toLowerCase()))throw new TypeError('OpenAPI contract source invalid');
  const entry=spec.paths[path],op=entry?.[method.toLowerCase()];
  if(!object(op)||typeof op.operationId!=='string'||!op.operationId)
    throw new TypeError('OpenAPI operation missing');
  const params=new Map(),seenAtOperation=new Set();
  for(const value of entry.parameters??[]){
    const p=parameter(spec,value),key=p.in+'|'+p.name;
    if(params.has(key))throw new TypeError('Duplicate inherited OpenAPI parameter');
    params.set(key,p);
  }
  for(const value of op.parameters??[]){
    const p=parameter(spec,value),key=p.in+'|'+p.name;
    if(seenAtOperation.has(key))throw new TypeError('Duplicate operation OpenAPI parameter');
    seenAtOperation.add(key);
    params.set(key,p); // An operation parameter may override a path-item declaration.
  }
  const declaredPlaceholders=[...path.matchAll(/\{([^}]+)\}/g)].map(x=>x[1]).sort();
  const parameterNames=[...params.values()].filter(x=>x.in==='path')
    .map(x=>x.name).sort();
  // A path placeholder without a declared parameter is a real spec gap.
  const undeclaredPath=declaredPlaceholders.filter(x=>!parameterNames.includes(x));
  const invalidPath=parameterNames.filter(x=>!declaredPlaceholders.includes(x));
  if(invalidPath.length)throw new TypeError('Orphan OpenAPI path parameter');
  const body=resolver(spec,op.requestBody);
  const responses=Object.entries(op.responses??{}).sort(([a],[b])=>a.localeCompare(b))
    .map(([status,value])=>({status,content:content(spec,resolver(spec,value))}));
  const security=op.security??spec.security??null;
  if(security!==null&&(!Array.isArray(security)||
     security.some(group=>!object(group)||Object.values(group).some(x=>!Array.isArray(x)))))
    throw new TypeError('Malformed OpenAPI security declaration');
  const securitySchemes=security===null?null:security.map(group=>
    Object.keys(group).sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const request={required:body?.required===true,content:content(spec,body)};
  return {method:method.toUpperCase(),path,operationId:op.operationId,
    operationDigest:sha(JSON.stringify(op)),
    parameters:[...params.values()].sort((a,b)=>
      (a.in+'|'+a.name).localeCompare(b.in+'|'+b.name)),
    undeclaredPath,request,responses,securitySchemes};
}
export function projectOpenApiContracts(spec){
  const contracts=[];
  for(const [path,entry] of Object.entries(spec.paths??{}))
    for(const method of methods)
      if(object(entry?.[method]))contracts.push(projectOperationWire(spec,path,method));
  return contracts.sort((a,b)=>(a.method+' '+a.path).localeCompare(b.method+' '+b.path));
}
export function contractDigest(contracts){return sha(JSON.stringify(contracts));}

// The separately checked official wire snapshot uses the same immutable source
// SHA as the SDK method inventory, not a new mutable online dependency.
export function validateOfficialWireSnapshot(reference,snapshot){
  if(snapshot?.schemaVersion!==1||!Array.isArray(snapshot.contracts)||
     snapshot.revision!==reference?.source?.revision||
     snapshot.sourceSha256!==reference?.source?.sha256||
     snapshot.operationDigest!==reference.operationDigest||
     snapshot.contractDigest!==contractDigest(snapshot.contracts)||
     snapshot.contracts.length!==reference.operations?.length)
    throw new TypeError('Official wire-contract snapshot provenance or digest drift');
  const expected=new Map(reference.operations.map(x=>[x.method+' '+x.path,x.operationId]));
  const seen=new Set();
  for(const contract of snapshot.contracts){
    if(!object(contract)||!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(contract.method)||
       expected.get(contract.method+' '+contract.path)!==contract.operationId||
       seen.has(contract.method+' '+contract.path)||typeof contract.operationDigest!=='string'||
       !/^[0-9a-f]{64}$/.test(contract.operationDigest))
      throw new TypeError('Missing, duplicate or forged official wire operation');
    seen.add(contract.method+' '+contract.path);
  }
  if(seen.size!==expected.size)throw new TypeError('Official wire operation missing');
  return snapshot.contracts;
}
export function verifiedOfficialWireRaw(reference,snapshot,rawText){
  if(sha(rawText)!==reference?.source?.sha256)
    throw new TypeError('Full official OpenAPI source checksum mismatch');
  validateOfficialWireSnapshot(reference,snapshot);
  const parsed=JSON.parse(rawText);
  if(parsed.info?.version!==reference.version||
     parsed.servers?.[0]?.url!==reference.host||
     contractDigest(projectOpenApiContracts(parsed))!==snapshot.contractDigest)
    throw new TypeError('Official wire-contract projection differs from pinned source');
  return {operations:snapshot.contracts.length,digest:snapshot.contractDigest};
}
