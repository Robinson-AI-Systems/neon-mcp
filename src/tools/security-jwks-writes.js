// D-8: audited project JWKS trust creation and revocation. No JWT key fetch.
// An auth trust change needs owner confirmation, exact scope and independent readback.
import {isIP} from 'node:net';
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {projectRead,projectScope} from './project-context.js';
import {verifiedEntries} from './security.js';

const id=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const provider=x=>typeof x==='string'&&/^[A-Za-z0-9 _.-]{1,80}$/.test(x);
function url(x){
 if(typeof x!=='string'||x.length>512)throw Error('Invalid JWKS trust URL');
 const u=new URL(x);
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||
    isIP(u.hostname)||!u.hostname.includes('.')||
    /(?:^|\.)(?:localhost|local|internal)$/i.test(u.hostname)||
    u.href!==x||u.hostname.length>253)throw Error('JWKS URL must be a public HTTPS issuer without credentials');
 return u.href;
}
function intent(a){
 if(a.action==='remove'){
  if(!id(a.jwksId)||a.url!==undefined||a.provider!==undefined||
     a.branchId!==undefined||a.audience!==undefined)
   throw Error('Remove requires only an exact JWKS ID');
  return {action:'remove',jwksId:a.jwksId};
 }
 if(a.action!=='add'||a.jwksId!==undefined||!id(a.branchId)||
    !provider(a.provider)||typeof a.audience!=='string'||
    !/^[A-Za-z0-9_.:/-]{1,128}$/.test(a.audience))
  throw Error('Add requires branch, issuer provider and explicit JWT audience');
 return {action:'add',branchId:a.branchId,provider:a.provider,
  audience:a.audience,url:url(a.url)};
}
async function load(a,c){
 const projectId=projectScope(c,a.projectId??null).projectId;
 if(!projectId||c.connection.profile!=='full')
  throw Error('Full owner project identity required');
 const client=await c.clientFor(projectId);
 const p=(await projectRead(client,'getProject',{path:{project_id:projectId}}))?.project;
 if(p?.id!==projectId||p.org_id!==c.connection.neonOrg)
  throw Error('JWKS trust project/organization identity unverified');
 const raw=await projectRead(client,'getProjectJWKS',{path:{project_id:projectId}});
 const entries=verifiedEntries(raw,projectId);
 if(entries.some(x=>x.jwksUrl===null))
  throw Error('An existing JWKS URL is unverified; refuse to mutate trust');
 const full=entries.map(x=>{
  const providerRow=raw.jwks.find(j=>j.id===x.id);
  const audience=providerRow.jwt_audience??null;
  if(audience!==null&&(typeof audience!=='string'||audience.length>128))
   throw Error('Invalid JWT audience on existing trust');
  return {...x,audience};
 });
 return {project:p,entries:full,client};
}
function check(a,state){
 const chosen=intent(a);
 if(chosen.action==='remove'){
  const matching=state.entries.filter(e=>e.id===chosen.jwksId);
  if(matching.length!==1)throw Error('The exact issuer was not found');
  return {...chosen,entry:matching[0]};
 }
 if(state.entries.length>=100)throw Error('The trust registry is at capacity');
 if(state.entries.some(e=>e.jwksUrl===chosen.url&&
    e.branchId===chosen.branchId))
  throw Error('That URL is already trusted on this branch');
 return chosen;
}
const def=defineWrite({name:'neon_security_set_jwks',
 access:true,projectWide:true,
 plan:async(a,c)=>{
  const state=await load(a,c),t=check(a,state);
  if(t.action==='add'){
   const b=(await projectRead(state.client,'getProjectBranch',{
    path:{project_id:state.project.id,branch_id:t.branchId}}))?.branch;
   // Creation on default/protected branches requires a distinct approved workflow.
   if(b?.id!==t.branchId||b.project_id!==state.project.id||
      b.default!==false||b.protected!==false)
    throw Error('JWKS trust creation requires a verified unprotected child branch');
  }
  return {target:'project:'+state.project.id,projectId:state.project.id,
   before:{project:state.project,entries:state.entries},
   summary:t.action==='remove'
    ?'Revoke JWT trust '+t.entry.id+' on project '+state.project.id+
     '. Tokens signed by this issuer may stop authenticating immediately.'
    :'Add JWT issuer '+new URL(t.url).hostname+' for unprotected branch '+
     t.branchId+' on '+state.project.id+' with explicit audience '+t.audience+
     '. This widens who can authenticate; trusted roles must already exist. Do not apply to a protected/production branch.'};
 },
 apply:async(a,c,{before,requestKey})=>{
  const state=await load(a,c),t=check(a,state);
  if(JSON.stringify(state.entries)!==JSON.stringify(before.entries))
   throw Error('JWKS trust registry changed since the preview');
  const pid=before.project.id;
  const params=t.action==='remove'
   ?{path:{project_id:pid,jwks_id:t.jwksId}}
   :{path:{project_id:pid},
     body:{jwks_url:t.url,provider_name:t.provider,branch_id:t.branchId,
      jwt_audience:t.audience,skip_role_creation:true}};
  return applyNeonWrite({client:state.client,
   operationId:t.action==='remove'?'deleteProjectJWKS':'addProjectJWKS',
   params,projectId:pid,requestKey});
 },
 readAfter:async(a,c)=>load(a,c),
 verify:(before,after,a)=>{
  if(after?.project?.id!==before.project.id||
     after.project.org_id!==before.project.org_id)return false;
  const change=intent(a),baseline=before.entries,rows=after.entries;
  if(change.action==='remove'){
   const expected=baseline.filter(e=>e.id!==change.jwksId);
   return baseline.length===expected.length+1&&
     JSON.stringify(rows)===JSON.stringify(expected);
  }
  if(rows.length!==baseline.length+1||!baseline.every(v=>
      JSON.stringify(v)===JSON.stringify(rows.find(x=>x.id===v.id))))
   return false;
  const created=rows.filter(x=>!baseline.some(v=>v.id===x.id));
  return created.length===1&&created[0].jwksUrl===change.url&&
   created[0].branchId===change.branchId&&
   created[0].provider===change.provider&&
   created[0].audience===change.audience;
 }
});
export const tools=[{...def.tool,profiles:['full'],area:'security',
 audience:['owner'],description:'Owner-confirmed JWT issuer trust add on verified unprotected branch or exact issuer revoke; provider readback and durable audit.',
 inputSchema:{type:'object',properties:{
  projectId:{type:'string',pattern:'^[a-z0-9-]{1,60}$'},
  action:{type:'string',enum:['add','remove']},
  jwksId:{type:'string',pattern:'^[a-z0-9-]{1,60}$'},
  url:{type:'string',minLength:10,maxLength:512},
  provider:{type:'string',minLength:1,maxLength:80},
  branchId:{type:'string',pattern:'^[a-z0-9-]{1,60}$'},
  audience:{type:'string',minLength:1,maxLength:128},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128},
  outsideApp:{type:'boolean'}},required:['action'],additionalProperties:false}}];
export function createSecurityJwksWriteHandlers({contextFor=createProjectWriteContext}={}){
 return {neon_security_set_jwks:async(args,ctx)=>def.handler(args,await contextFor(ctx))};
}
export const handlers=createSecurityJwksWriteHandlers();
