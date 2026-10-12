// RTC 1 compatibility metadata. This is not a credential/authorization boundary.
// The public contract remains unadvertised until the authenticated HTTPS doors land.
import {isToolAllowed} from './profiles.js';

export const RTC_PREFIX='neon';
const LISTINGS=new Set(['catalog','compact']);
const compact=new Set(['neon_search_tools','neon_describe_tool','neon_call',
  'neon_batch','neon_get_result','neon_whoami','neon_api_search']);
const audienceSet=new Set(['builder','owner','operator']);
const namePattern=/^neon_[a-z0-9_]+$/;

export function rtcToolMetadata(tool){
  if(!namePattern.test(tool?.name||'') || typeof tool?.description!=='string' ||
      tool.description.length<1 || tool.description.length>160 ||
      !Array.isArray(tool.profiles) || !tool.profiles.length ||
      !['boolean'].includes(typeof tool.writes))
    throw new TypeError('Unverified RTC tool declaration');
  const writes=tool.writes===true,destructive=tool.destructive===true;
  const area=typeof tool.area==='string'&&tool.area?tool.area:'server';
  const audience=Array.isArray(tool.audience)&&tool.audience.length?
    tool.audience:['builder','owner','operator'];
  // Describe the same read selector arguments honored by the shared MCP
  // result-shaping boundary. Do not advertise them as write arguments.
  const baseSchema=tool.inputSchema||{type:'object',properties:{}};
  const inputSchema=writes?baseSchema:{...baseSchema,
    properties:{...baseSchema.properties,
      detail:{type:'string',enum:['summary','full'],
        description:'Choose brief (default) or full details.'},
      fields:{type:'string',maxLength:512,
        description:'Comma-separated dotted fields to select.'}}};
  return {name:tool.name,description:tool.description,
    inputSchema,
    area,profiles:[...tool.profiles],writes,
    money:tool.money===true,destructive,audience:[...audience],
    annotations:{readOnlyHint:!writes,destructiveHint:destructive,
      idempotentHint:!writes||tool.writeContract==='defineWrite-v1',
      openWorldHint:tool.productionEffect==='write'}};
}
export function rtcManifest(registry,{version='0.1.0'}={}){
  if(!Array.isArray(registry?.tools))throw new TypeError('RTC registry required');
  const items=registry.tools.map(rtcToolMetadata);
  const names=new Set(items.map(t=>t.name));
  if(names.size!==items.length)throw new TypeError('Duplicate RTC tool');
  return {rtc:1,server:'robinson-neon-mcp',prefix:RTC_PREFIX,version,
    apiVersion:'neon-sdk-7.0.1',
    areas:[...new Set(items.map(t=>t.area))].sort(),
    counts:{tools:items.length,writes:items.filter(t=>t.writes).length,
      money:items.filter(t=>t.money).length},
    profiles:['read_only','everyday','full'],
    listingModes:['catalog','compact'],modes:['preview','production'],devTools:false};
}
export function rtcCatalog(registry,connection,{listing,q,area,audience,limit=20}={},env={}){
  const listingMode=LISTINGS.has(listing)?listing:
    LISTINGS.has(connection?.listing)?connection.listing:'compact';
  if(!Number.isInteger(limit)||limit<1||limit>100 ||
    (q!==undefined&&(typeof q!=='string'||q.length>160))||
    (area!==undefined&&(typeof area!=='string'||area.length>80))||
    (audience!==undefined&&!audienceSet.has(audience)))
    throw new TypeError('Invalid scoped RTC discovery arguments');
  const query=q?.trim().toLowerCase()||'';
  const allowed=registry.tools.filter(t=>isToolAllowed(t,connection,{
    productionDeployment:env.VERCEL_ENV==='production'}));
  return allowed.filter(t=>(listingMode==='catalog'||compact.has(t.name)||
       t.name.startsWith('neon_workflow_')&&t.writes===false))
    .map(rtcToolMetadata)
    .filter(t=>(!area||t.area===area)&&(!audience||t.audience.includes(audience))&&
      (!query||`${t.name} ${t.description} ${t.area}`.toLowerCase().includes(query)))
    .slice(0,limit);
}
export function rtcError(code,{status=400}={}){
  const allowed=new Set(['needs_confirmation','refused_by_guard','not_found',
    'permission','service_error','rate_limited','pass_expired','pass_revoked',
    'invalid_args','outside_scope']);
  const key=allowed.has(code)?code:'service_error';
  return {status,body:{ok:false,error:{what:key.replaceAll('_',' '),
    cause:key,todo:'Review access, scope and request details.',
    technical:'',code:key}}};
}
export function rtcOpenApi(){
  const secured={security:[{rtcPass:[]}]};
  const entry=(method,description,auth=true)=>({[method]:{
    summary:description,...auth?secured:{},responses:{200:{description:'RTC response'}}}});
  return {openapi:'3.1.0',
    info:{title:'Robinson Neon MCP RTC HTTPS tools',version:'1.0.0'},
    components:{securitySchemes:{rtcPass:{type:'http',scheme:'bearer'}}},
    paths:{
      '/api/contract':entry('get','Public RTC 1 service manifest',false),
      '/api/openapi.json':entry('get','RTC HTTPS API description',false),
      '/api/tools':entry('get','Find scoped tools'),
      '/api/tools/{name}':{...entry('get','Describe scoped tool'),...entry('post','Call scoped tool')},
      '/api/tools/_batch':entry('post','Call up to 10 read-only tools'),
      '/api/results/{handle}':entry('get','Read own scoped result'),
      '/api/whoami':entry('get','Read scoped pass identity')
    }};
}
