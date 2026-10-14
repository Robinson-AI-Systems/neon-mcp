// V-1: expiring, run-owned development branches and exact recorded-object cleanup.
import {createHash} from 'node:crypto';
import {defineWrite} from '../core/write.js';
import {defineReadTool,readText,readId} from './read-descriptors.js';
import {projectScope,projectRead} from './project-context.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {createSpendGuard} from '../neon/spend.js';
import {attestedProjectPlan} from './branch-lifecycle.js';
import {classifyTarget} from '../neon/production.js';
import {applyNeonWrite} from '../neon/write-neon.js';

const ID=/^[a-z0-9-]{1,60}$/;
const RUN=/^[a-z0-9-]{4,64}$/;
const NAME=/^[A-Za-z][A-Za-z0-9_-]{2,79}$/;
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const runId={type:'string',pattern:'^[a-z0-9-]{4,64}$'};
const controls={projectId:id,dryRun:{type:'boolean'},confirm:{type:'boolean'},
 outsideApp:{type:'boolean'},requestKey:{type:'string',minLength:8,maxLength:128}};
const input=(more,required)=>({type:'object',properties:{...controls,...more},
 required,additionalProperties:false});
function scope(a,c){
 const p=projectScope(c,a.projectId??null);
 if(!p.projectId||!ID.test(p.projectId))throw Error('Choose one enrolled development project');
 return {orgId:p.org,projectId:p.projectId};
}
async function verifiedProject(a,c){
 const s=scope(a,c),client=await c.clientFor(s.projectId);
 const result=await projectRead(client,'getProject',{path:{project_id:s.projectId}});
 if(result?.project?.id!==s.projectId||result.project.org_id!==s.orgId)
  throw Error('Exact Neon project identity unavailable');
 return {...s,client,project:result.project};
}
async function allBranches(client,projectId){
 const branches=[],seenIds=new Set(),seenCursors=new Set();
 let cursor=null;
 // A bounded complete provider census, not an implicit 100-branch project cap.
 // Above 10,000 branches (100 pages) fail closed instead of claiming completeness.
 for(let page=0;page<100;page++){
  const body=await projectRead(client,'listProjectBranches',{
   path:{project_id:projectId},query:{limit:100,...(cursor?{cursor}:{})}});
  if(!Array.isArray(body?.branches)||body.branches.length>100)
   throw Error('Provider returned an invalid development branch page');
  for(const item of body.branches){
   if(!ID.test(item?.id||'')||item.project_id!==projectId||
      seenIds.has(item.id))throw Error('Invalid, foreign or duplicate provider branch');
   seenIds.add(item.id);
   const annotation=body.annotations?.[item.id]??item.annotation??null;
   branches.push({...item,...(annotation?{runAnnotation:annotation}:{})});
  }
  const next=body.pagination?.cursor??null;
  if(next===null)return branches;
  if(typeof next!=='string'||next.length===0||seenCursors.has(next)||
     body.branches.length===0)throw Error('Incomplete or repeated provider pagination');
  seenCursors.add(next);cursor=next;
 }
 throw Error('Provider branch inventory exceeds safe 10,000-row census; use bounded provider maintenance');
}

async function branchDetails(client,projectId,branchId){
 const data=await projectRead(client,'getProjectBranch',
  {path:{project_id:projectId,branch_id:branchId}});
 if(data?.branch?.id!==branchId||data.branch.project_id!==projectId)
  throw Error('Independent branch readback disagrees with the target');
 return data;
}
async function exactBranch(client,projectId,branchId){
 return (await branchDetails(client,projectId,branchId)).branch;
}
function expiry(hours){
 const d=new Date(Date.now()+hours*3600000);
 return d.toISOString().slice(0,19)+'Z';
}
function config(x){
 if(!x||!Number.isSafeInteger(x.ttl_hours)||x.ttl_hours<1||
    x.ttl_hours>720||!x.compute||
    ![x.compute.min_cu,x.compute.max_cu].every(v=>
      typeof v==='number'&&Number.isFinite(v)&&v>=0.25&&v<=16)||
    x.compute.min_cu>x.compute.max_cu||
    !Number.isSafeInteger(x.compute.suspend_seconds)||
    x.compute.suspend_seconds<300||x.compute.suspend_seconds>3600)
  throw Error('Stored development TTL and compute policy unavailable');
 return x;
}
function runFor(a,c){
 if(a.runId!==undefined){
  if(!RUN.test(a.runId))throw Error('Invalid run identity');
  return a.runId;
 }
 const key=c.writeKey('neon_dev_branch_create',a);
 if(!/^rmcp_[a-z0-9_]{5,128}$/.test(key||''))
  throw Error('Cannot derive stable owner run identity');
 return 'run-'+createHash('sha256').update(key).digest('hex').slice(0,24);
}
async function createPreview(a,c){
 if(!NAME.test(a.name||'')||!ID.test(a.parentBranchId||'')||
    a.schemaOnly!==undefined&&typeof a.schemaOnly!=='boolean'||
    a.ttlHours!==undefined&&(!Number.isSafeInteger(a.ttlHours)||
      a.ttlHours<1||a.ttlHours>720))
  throw Error('Choose a valid name, explicit parent and TTL up to 30 days');
 const s=await verifiedProject(a,c),bs=await allBranches(s.client,s.projectId);
 const parent=bs.find(b=>b.id===a.parentBranchId);
 if(!parent||bs.some(b=>b.name===a.name))
  throw Error('Parent absent or development branch name already used');
 const settings=config(await c.db.getDevSettings?.());
 const hours=a.ttlHours??settings.ttl_hours;
 if(hours<1||hours>720)throw Error('Development expiry exceeds Neon maximum');
 const rid=runFor(a,c);
 // A provider parent may be the main branch, but only the *new child* is mutated.
 // B-1 still checks protected resources and app ownership on the parent.
 const cls=await classifyTarget(c,{projectId:s.projectId,branchId:parent.id});
 if(!cls.allowed)throw Error('Parent identity could not be classified');
 return {...s,parent,runId:rid,auditKey:c.writeKey('neon_dev_branch_create',a),expiresAt:expiry(hours),
  settings,count:bs.length,branchName:a.name,schemaOnly:a.schemaOnly===true,
  plan:attestedProjectPlan(s.project,s.orgId)};
}
const create=defineWrite({name:'neon_dev_branch_create',
 productionEffect:'none',
 spend:async(_a,c,before)=>{
  const observed=before.plan;
  if(observed?.verified!==true||!['Launch','Scale'].includes(observed.name)||
     before.count>=observed.branchLimit)return null;
  let saved=null;
  try{saved=await c.db.getVerifiedNeonPlan?.(c.connection.neonOrg);}catch{}
  if(saved?.verified===true&&saved.name!==observed.name)return null;
  const guard=createSpendGuard({db:c.db});
  const branch=await guard.price({kind:'branch',plan:observed.name,
   before:{count:before.count},after:{count:before.count+1}});
  const compute=await guard.price({kind:'compute',plan:observed.name,
   before:{maxCu:0},after:{maxCu:before.settings.compute.max_cu}});
  if(!branch?.canApply||!compute?.canApply||
     !Number.isSafeInteger(branch.increaseCents)||
     !Number.isSafeInteger(compute.increaseCents))return null;
  return {...branch,increaseCents:branch.increaseCents+compute.increaseCents,
   canApply:true};
 },
 plan:async(a,c)=>{
  const s=await createPreview(a,c);
  return {projectId:s.projectId,branchId:s.parent.id,
   target:'branch:'+s.projectId+'/'+s.parent.id,before:s,
   summary:'Create expiring, unprotected development branch '+s.branchName+
    ' under run '+s.runId+', from verified parent '+s.parent.id+
    (s.schemaOnly?' (schema only)':' (data copy)')+
    ', expiring '+s.expiresAt+
    ', read-write compute '+s.settings.compute.min_cu+'–'+
    s.settings.compute.max_cu+' CU (autosuspend '+s.settings.compute.suspend_seconds+
    ' seconds); monthly cost requires the stored owner spending caps. No production branch mutation.'};
 },
 apply:async(a,c,{before,requestKey:key})=>{
  if(key!==before.auditKey)throw Error('Write request identity drift');
  const fresh=await verifiedProject(a,c);
  const branches=await allBranches(fresh.client,fresh.projectId);
  const parent=branches.find(x=>x.id===before.parent.id);
  if(!parent||branches.length!==before.count||branches.some(x=>x.name===before.branchName)||
     parent.project_id!==fresh.projectId||
     JSON.stringify({id:parent.id,protected:parent.protected,default:parent.default})!==
     JSON.stringify({id:before.parent.id,protected:before.parent.protected,default:before.parent.default}))
   throw Error('Parent or branch inventory changed; new preview required');
  const saved=config(await c.db.getDevSettings?.());
  if(JSON.stringify(saved)!==JSON.stringify(before.settings))
   throw Error('Developer policy changed since review');
  if(await c.guards.checkProtected({projectId:fresh.projectId,branchId:parent.id},c)!==true||
     await c.guards.checkApp({projectId:fresh.projectId,branchId:parent.id},c,a)!==true)
   throw Error('Protected or application-owned parent refused');
  const reserved=await c.db.reserveDevRun?.({id:before.runId,orgId:fresh.orgId,
   projectId:fresh.projectId,connectionId:c.connectionId??null});
  if(reserved?.id!==before.runId)throw Error('Run ownership reservation unavailable');
  const body={branch:{name:before.branchName,parent_id:parent.id,
    init_source:before.schemaOnly?'schema-only':'parent-data',
    expires_at:before.expiresAt,protected:false},
   endpoints:[{type:'read_write',
    autoscaling_limit_min_cu:saved.compute.min_cu,
    autoscaling_limit_max_cu:saved.compute.max_cu,
    suspend_timeout_seconds:saved.compute.suspend_seconds}],
   annotation_value:{rtc_run:before.runId,rtc_request:key}};
  const result=await applyNeonWrite({client:fresh.client,operationId:'createProjectBranch',
   params:{path:{project_id:fresh.projectId},body},
   projectId:fresh.projectId,requestKey:key});
  if(result?.confirmed!==true)return {confirmed:'pending',operations:result?.operations??[]};
  // A lost response may have been resolved by the pinned SDK's rtc_request
  // annotation readback; that result is a branch, not a {branch} envelope.
  const recovered=result.data?.branch??result.data;
  const branchId=recovered?.id;
  if(!ID.test(branchId||'')||recovered.project_id!==fresh.projectId)
   return {confirmed:'pending',operations:result.operations??[]};
  // Persist ownership only after independently checking the exact created ID.
  const detailed=await branchDetails(fresh.client,fresh.projectId,branchId);
  const observed=detailed.branch;
  if(observed.name!==before.branchName||observed.parent_id!==parent.id||
     observed.protected===true||observed.default===true||
     observed.expires_at!==before.expiresAt||
     detailed.annotation?.value?.rtc_run!==before.runId||
     detailed.annotation?.value?.rtc_request!==key)
   return {confirmed:'pending',operations:result.operations??[]};
  const recorded=await c.db.recordDevRunBranch?.({orgId:fresh.orgId,
   projectId:fresh.projectId,runId:before.runId,branchId,parentId:parent.id,
   expiresAt:before.expiresAt});
  if(recorded!==true)return {confirmed:'pending',operations:result.operations??[]};
  c.devCreatedBranchId=branchId;
  return {confirmed:true,operations:result.operations??[]};
 },
 readAfter:async(a,c)=>{
  if(!ID.test(c.devCreatedBranchId||''))return null;
  const s=await verifiedProject(a,c);
  const detail=await branchDetails(s.client,s.projectId,c.devCreatedBranchId);
  const branch=detail.branch;
  const result=await projectRead(s.client,'listProjectBranchEndpoints',{
   path:{project_id:s.projectId,branch_id:branch.id}});
  if(!Array.isArray(result?.endpoints)||result.endpoints.some(e=>
     e.project_id!==s.projectId||e.branch_id!==branch.id))return null;
  return {branch,endpoints:result.endpoints,annotation:detail.annotation?.value??null};
 },
 verify:async(before,after)=>{
  const b=after?.branch;
  return after?.annotation?.rtc_run===before.runId&&
   after?.annotation?.rtc_request===before.auditKey&&
   b?.name===before.branchName&&b.parent_id===before.parent.id&&
   b.protected===false&&b.default===false&&b.expires_at===before.expiresAt&&
   after.endpoints.length===1&&after.endpoints[0].type==='read_write'&&
   after.endpoints[0].autoscaling_limit_min_cu===before.settings.compute.min_cu&&
   after.endpoints[0].autoscaling_limit_max_cu===before.settings.compute.max_cu&&
   after.endpoints[0].suspend_timeout_seconds===before.settings.compute.suspend_seconds;
 }});

function depths(owned){
 const ids=new Set(owned.map(x=>x.object_id));
 const byId=new Map(owned.map(x=>[x.object_id,x]));
 function depth(id,seen=new Set()){
  if(seen.has(id))throw Error('Cyclic branch ownership graph');
  const item=byId.get(id);
  if(!ids.has(item?.parent_id))return 0;
  return 1+depth(item.parent_id,new Set([...seen,id]));
 }
 return owned.map(x=>({...x,depth:depth(x.object_id)}))
  .sort((a,b)=>b.depth-a.depth||a.object_id.localeCompare(b.object_id));
}
async function cleanupPreview(a,c){
 if(a.outsideApp!==undefined)throw Error('Cleanup cannot override application ownership');
 if(!RUN.test(a.runId||''))throw Error('Select an existing owned run ID');
 const s=await verifiedProject(a,c);
 const run=await c.db.getDevRun?.({orgId:s.orgId,projectId:s.projectId,runId:a.runId});
 if(run?.id!==a.runId||run.status!=='active')
  throw Error('Active owned developer run not found');
 const objects=await c.db.listDevRunObjects?.({orgId:s.orgId,projectId:s.projectId,runId:a.runId});
 if(!Array.isArray(objects)||objects.length<1||objects.length>100||
    objects.some(o=>o.run_id!==a.runId||o.object_type!=='branch'||
     !ID.test(o.object_id||''))||
    new Set(objects.map(o=>o.object_id)).size!==objects.length)
  throw Error('Complete recorded run ownership required');
 const branches=await allBranches(s.client,s.projectId);
 const byId=new Map(branches.map(x=>[x.id,x]));
 const recorded=new Set(objects.map(x=>x.object_id));
 for(const o of objects){
  const b=byId.get(o.object_id);
  if(o.cleaned===true&&b)throw Error('Previously cleaned run branch is active');
  if(!b)continue; // Provider-side expiry, proven by complete listing.
  const exact=await exactBranch(s.client,s.projectId,b.id);
  if(exact.default===true||exact.protected===true||
     exact.project_id!==s.projectId||
     await c.guards.checkProtected({projectId:s.projectId,branchId:b.id},c)!==true||
     await c.guards.checkApp({projectId:s.projectId,branchId:b.id},c,{...a,outsideApp:false})!==true)
   throw Error('Protected or app-owned run branch refused');
  const cls=await classifyTarget(c,{projectId:s.projectId,branchId:b.id});
  if(!cls.allowed||cls.production)
   throw Error('Run branch has become production/shared; cleanup refused');
  if(branches.some(child=>child.parent_id===b.id&&!recorded.has(child.id)))
   throw Error('Unrecorded child branch blocks cleanup');
 }
 return {...s,run,objects:depths(objects),branches};
}
const cleanup=defineWrite({name:'neon_dev_cleanup',destructive:true,
 productionEffect:'none',
 plan:async(a,c)=>{
  const s=await cleanupPreview(a,c);
  const active=s.objects.filter(o=>o.cleaned!==true&&
   s.branches.some(b=>b.id===o.object_id));
  return {projectId:s.projectId,branchId:active[0]?.object_id??s.objects[0].object_id,
   target:'dev-run:'+s.projectId+'/'+a.runId,before:s,
   summary:'Soft-delete '+active.length+' recorded development branches in run '+
    a.runId+' (deepest children first), mark separately verified expired entries,'+
    ' preserve all unrecorded branches. Deletion is recoverable within seven days.'+
    ' Never delete production, protected or app-owned objects.'};
 },
 apply:async(a,c,{before,requestKey:key})=>{
  const now=await cleanupPreview(a,c);
  if(JSON.stringify(now.objects.map(x=>({id:x.object_id,cleaned:x.cleaned,
     parent:x.parent_id})))!==JSON.stringify(before.objects.map(x=>({
     id:x.object_id,cleaned:x.cleaned,parent:x.parent_id}))))
   throw Error('Recorded ownership changed since preview');
  // Parent/child ancestry and production/access guards were just reread.
  for(const object of now.objects){
   if(object.cleaned===true)continue;
   let current=await allBranches(now.client,now.projectId);
   if(current.some(b=>b.id===object.object_id)){
    const exact=await exactBranch(now.client,now.projectId,object.object_id);
    const classification=await classifyTarget(c,{projectId:now.projectId,
     branchId:object.object_id});
    if(exact.default===true||exact.protected===true||
       !classification.allowed||classification.production||
       await c.guards.checkProtected({projectId:now.projectId,branchId:object.object_id},c)!==true||
       await c.guards.checkApp({projectId:now.projectId,branchId:object.object_id},c,{...a,outsideApp:false})!==true)
     throw Error('Branch became protected, production, shared or app-owned; refusing deletion');
    if(current.some(b=>b.parent_id===object.object_id))
     throw Error('Existing child prevents branch cleanup');
    const nestedKey='rmcp_'+createHash('sha256').update(key+'/'+object.object_id)
      .digest('hex').slice(0,36);
    const result=await applyNeonWrite({client:now.client,
     operationId:'deleteProjectBranch',params:{path:{
      project_id:now.projectId,branch_id:object.object_id}},
     projectId:now.projectId,requestKey:nestedKey});
    if(result?.confirmed!==true)return {confirmed:'pending',
     operations:result?.operations??[]};
    current=await allBranches(now.client,now.projectId);
    if(current.some(b=>b.id===object.object_id))return {confirmed:'pending'};
   }
   const marked=await c.db.markDevRunBranchCleaned?.({orgId:now.orgId,
    projectId:now.projectId,runId:a.runId,branchId:object.object_id,
    note:'independent provider absence after guarded cleanup or provider expiry'});
   if(marked!==true)return {confirmed:'pending'};
  }
  const finished=await c.db.finishDevRun?.({orgId:now.orgId,
   projectId:now.projectId,runId:a.runId});
  return {confirmed:finished===true?true:'pending'};
 },
 readAfter:async(a,c)=>{
  const s=await verifiedProject(a,c);
  const run=await c.db.getDevRun?.({orgId:s.orgId,projectId:s.projectId,runId:a.runId});
  const objects=await c.db.listDevRunObjects?.({orgId:s.orgId,projectId:s.projectId,runId:a.runId});
  const branches=await allBranches(s.client,s.projectId);
  return {run,objects,branches};
 },
 verify:async(before,after)=>after?.run?.status==='cleaned'&&
  Array.isArray(after.objects)&&after.objects.length===before.objects.length&&
  after.objects.every(x=>x.cleaned===true&&!after.branches.some(b=>b.id===x.object_id))});

const createSchema=input({name:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{2,79}$'},
 parentBranchId:id,runId,ttlHours:{type:'integer',minimum:1,maximum:720},
 schemaOnly:{type:'boolean'}},['name','parentBranchId']);
// Cursors are read-only bookmarks, not owner authorization or cleanup evidence.
const cursorPattern=/^[A-Za-z0-9_-]{1,512}$/;
function decodeRunCursor(raw,scope,filters){
 if(raw===undefined)return {cursorAt:null,cursorId:null};
 if(typeof raw!=='string'||!cursorPattern.test(raw))
  throw Error('Invalid run-page cursor');
 let data;
 try{
  data=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));
 }catch{throw Error('Invalid run-page cursor');}
 if(!data||typeof data!=='object'||Array.isArray(data)||
    Object.keys(data).sort().join(',')!=='at,id,older,org,project,status,v'||
    data.v!==1||data.org!==scope.orgId||data.project!==scope.projectId||
    data.status!==filters.status||data.older!==filters.olderThanDays||
    typeof data.at!=='string'||data.at.length>40||
    !/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{1,6})?Z$/.test(data.at)||
    Number.isNaN(Date.parse(data.at))||!RUN.test(data.id||'')||
    Buffer.from(JSON.stringify(data)).toString('base64url')!==raw)
  throw Error('Run-page cursor does not match the enrolled scope and filters');
 return {cursorAt:data.at,cursorId:data.id};
}
function encodeRunCursor(last,scope,filters){
 const at=last?.created_at_cursor;
 if(typeof at!=='string'||at.length>40||Number.isNaN(Date.parse(at))||
    !RUN.test(last?.id||''))throw Error('Complete run-page ordering unavailable');
 return Buffer.from(JSON.stringify({v:1,org:scope.orgId,project:scope.projectId,
  status:filters.status,older:filters.olderThanDays,at,id:last.id}))
  .toString('base64url');
}

const cleanupSchema={type:'object',properties:{projectId:id,runId,
 dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}},
 required:['runId'],additionalProperties:false};
export const tools=[
 {...create.tool,description:'Create an expiring, cost-checked run-owned development branch with verified compute and durable audit.',
  inputSchema:createSchema,profiles:['full'],area:'developer',audience:['builder','owner']},
 defineReadTool('neon_dev_list_runs','Page scoped development runs, recorded expiry and cleanup state; never infer provider absence.',
  {projectId:readId,limit:{type:'integer',minimum:1,maximum:50},
   status:{type:'string',enum:['all','active','cleaned']},
   olderThanDays:{type:'integer',minimum:1,maximum:3650},
   cursor:{type:'string',pattern:'^[A-Za-z0-9_-]{1,512}
 {...cleanup.tool,description:'Confirm deletion of only recorded, non-production run branches; verify absence and preserve other branches.',
  inputSchema:cleanupSchema,profiles:['full'],area:'developer',audience:['builder','operator']}];
export function createDevRunHandlers({contextFor=createProjectWriteContext}={}){
 return {
  async neon_dev_branch_create(a,raw){return create.handler(a,await contextFor(raw));},
  async neon_dev_list_runs(a,raw){
   const c=await contextFor(raw),s=scope(a,c);
   const limit=a.limit??50,filters={status:a.status??'all',
    olderThanDays:a.olderThanDays??null};
   if(!Number.isSafeInteger(limit)||limit<1||limit>50||
      !['all','active','cleaned'].includes(filters.status)||
      filters.olderThanDays!==null&&(!Number.isSafeInteger(filters.olderThanDays)||
       filters.olderThanDays<1||filters.olderThanDays>3650))
    throw Error('Invalid recorded-run page filters');
   const cursor=decodeRunCursor(a.cursor,s,filters);
   const rows=await c.db.listDevRuns?.({orgId:s.orgId,projectId:s.projectId,
    limit,...filters,...cursor});
   if(!Array.isArray(rows)||rows.length>limit+1||
      rows.some(r=>!RUN.test(r?.id||'')||r.project_id!==s.projectId||
       !['active','cleaned'].includes(r.status)))
    throw Error('Complete scoped developer run page unavailable');
   const hasMore=rows.length>limit,runs=rows.slice(0,limit);
   const details=[];
   for(const r of runs){
    const objects=await c.db.listDevRunObjects?.({orgId:s.orgId,
     projectId:s.projectId,runId:r.id});
    if(!Array.isArray(objects)||objects.length>100||
       objects.some(o=>o.run_id!==r.id||o.object_type!=='branch'))
     throw Error('Complete persisted run objects required');
    details.push({runId:r.id,status:r.status,createdAt:r.created_at,
     cleanedAt:r.cleaned_at,objects:objects.map(o=>({
      type:o.object_type,id:o.object_id,parentId:o.parent_id,
      expiresAt:o.expires_at,cleaned:o.cleaned,cleanedNote:o.cleaned_note
     })),remaining:r.remaining});
   }
   return readText({projectId:s.projectId,runs:details,
    hasMore,nextCursor:hasMore?encodeRunCursor(runs.at(-1),s,filters):null,
    filters,recordedOnly:true,
    caution:'Recorded expiration and cleanup status do not prove Neon provider absence. Use individually confirmed guarded cleanup.'});
  },
  async neon_dev_cleanup(a,raw){return cleanup.handler(a,await contextFor(raw));}
 };
}
export const handlers=createDevRunHandlers();
}},{area:'developer'}),
 {...cleanup.tool,description:'Confirm deletion of only recorded, non-production run branches; verify absence and preserve other branches.',
  inputSchema:cleanupSchema,profiles:['full'],area:'developer',audience:['builder','operator']}];
export function createDevRunHandlers({contextFor=createProjectWriteContext}={}){
 return {
  async neon_dev_branch_create(a,raw){return create.handler(a,await contextFor(raw));},
  async neon_dev_list_runs(a,raw){
   const c=await contextFor(raw),s=scope(a,c);
   const runs=await c.db.listDevRuns?.({orgId:s.orgId,projectId:s.projectId,
    limit:a.limit??50});
   if(!Array.isArray(runs)||runs.length>50)
    throw Error('Complete scoped developer run inventory unavailable');
   const details=[];
   for(const r of runs){
    const objects=await c.db.listDevRunObjects?.({orgId:s.orgId,
     projectId:s.projectId,runId:r.id});
    if(!Array.isArray(objects)||objects.length>100||
       objects.some(o=>o.run_id!==r.id||o.object_type!=='branch'))
     throw Error('Complete persisted run objects required');
    details.push({runId:r.id,status:r.status,createdAt:r.created_at,
     cleanedAt:r.cleaned_at,objects:objects.map(o=>({
      type:o.object_type,id:o.object_id,parentId:o.parent_id,
      expiresAt:o.expires_at,cleaned:o.cleaned,cleanedNote:o.cleaned_note
     })),remaining:r.remaining});
   }
   return readText({projectId:s.projectId,runs:details});
  },
  async neon_dev_cleanup(a,raw){return cleanup.handler(a,await contextFor(raw));}
 };
}
export const handlers=createDevRunHandlers();
