// D-1 project lifecycle: every external mutation uses B-1, production, protected and app guards.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {projectScope,projectRead} from './project-context.js';
import {call} from '../neon/client.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {waitForOperations} from '../neon/operations.js';
import {createOneTimeSecrets} from '../core/one-time.js';
import {createSpendGuard} from '../neon/spend.js';

const id=/^[a-z0-9-]{1,60}$/, nameOk=v=>typeof v==='string'&&
 v.length>=1&&v.length<=100&&!/[\r\n\x00-\x1f]/.test(v);
const ids={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const text={type:'string',minLength:1,maxLength:100};
const properties={dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128},outsideApp:{type:'boolean'}};
const schema=(fields,required=[])=>({type:'object',
 properties:{...properties,...fields},required,additionalProperties:false});
const read=async(ctx,pid)=>{const data=await projectRead(await ctx.clientFor(pid),'getProject',
 {path:{project_id:pid}});if(data?.project?.id!==pid||
 data.project.org_id!==ctx.connection.neonOrg)throw Error('Project mismatch');
 return data.project;};
const selected=(args,ctx)=>{const p=projectScope(ctx,args.projectId??null).projectId;
 if(!p||!id.test(p))throw Error('Choose a scoped project');return p;};
const safeProject=async(args,ctx)=>read(ctx,selected(args,ctx));
const listDeleted=async(ctx,pid)=>{
 const data=await projectRead(await ctx.clientFor(pid),'listProjects',{
  query:{org_id:ctx.connection.neonOrg,recoverable:true,search:pid,limit:100}});
 return data.projects?.find(p=>p.id===pid&&p.org_id===ctx.connection.neonOrg)||null;
};
const run=async(ctx,operationId,params,pid,key)=>applyNeonWrite({
 client:await ctx.clientFor(pid),operationId,params,projectId:pid,requestKey:key});
const make=(def,extra,options={})=>({...def.tool,profiles:options.profiles||['full'],
 description:extra.description,key:options.key||'project',
 ...(options.secret?{secretRoute:'/api/neon/setup',oneTimeOnly:true}:{}),
 area:'projects',audience:['owner','operator'],inputSchema:extra.inputSchema});
const rename=defineWrite({name:'neon_project_rename',projectWide:true,
 plan:async(a,c)=>{if(!nameOk(a.name))throw Error('Invalid project name');
  const before=await safeProject(a,c);
  if(before.name===a.name)throw Error('Project already has that name');
  return {target:'project:'+before.id,projectId:before.id,before,
   summary:'Rename project '+before.id+' to '+a.name};},
 apply:async(a,c,{requestKey:key})=>run(c,'updateProject',{
  path:{project_id:selected(a,c)},body:{project:{name:a.name}}},selected(a,c),key),
 readAfter:safeProject,
 verify:(before,after,a)=>before.id===after.id&&after.name===a.name,
 inverse:(a,b)=>({tool:'neon_project_rename',args:{project_id:b.id}})
});
const del=defineWrite({name:'neon_project_delete',projectWide:true,destructive:true,key:'org',
 plan:async(a,c)=>{
  const before=await safeProject(a,c);
  const pid=before.id,client=await c.clientFor(pid);
  const br=await projectRead(client,'listProjectBranches',{
   path:{project_id:pid},query:{limit:100}});
  if(!Array.isArray(br.branches)||br.pagination?.cursor)
   throw Error('Cannot enumerate all branches');
  let databases=0;
  for(const branch of br.branches){
   const body=await projectRead(client,'listProjectBranchDatabases',{
    path:{project_id:pid,branch_id:branch.id}});
   if(!Array.isArray(body.databases))throw Error('Missing databases');
   databases+=body.databases.length;
  }
  const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',
   dateStyle:'medium'}).format(new Date(Date.now()+7*86400000));
  return {target:'project:'+pid,projectId:pid,before,
   summary:'Soft-delete '+pid+'; '+br.branches.length+' branches and '+databases+
    ' databases affected. Recoverable until about '+date+' Denver time; never hard delete.'};
 },
 apply:async(a,c,{requestKey:key})=>run(c,'deleteProject',
  {path:{project_id:selected(a,c)}},selected(a,c),key),
 readAfter:async(a,c)=>listDeleted(c,selected(a,c)),
 verify:(before,after)=>after?.id===before.id,
 inverse:(_a,b)=>({tool:'neon_project_recover',args:{project_id:b.id}})
});
const recover=defineWrite({name:'neon_project_recover',projectWide:true,key:'org',
 plan:async(a,c)=>{const pid=selected(a,c),before=await listDeleted(c,pid);
  if(!before)throw Error('Project not recoverable');
  return {target:'project:'+pid,projectId:pid,before,
   summary:'Recover soft-deleted project '+pid+' within Neon recovery window'};},
 apply:async(a,c,{requestKey:key})=>run(c,'recoverProject',
  {path:{project_id:selected(a,c)}},selected(a,c),key),
 readAfter:safeProject,
 verify:(before,after)=>before.id===after.id
});
const create=defineWrite({name:'neon_project_create',projectWide:true,key:'org',
 secret:true,
 spend:async(a,c,_before)=>{
  const plan=typeof c.db.getVerifiedNeonPlan==='function'
   ? await c.db.getVerifiedNeonPlan(c.connection.neonOrg) : await c.planFor?.();
  if(!['Launch','Scale'].includes(plan?.name)||plan.verified!==true)
   throw Error('Verified billable plan required');
  return createSpendGuard({db:c.db}).price({kind:'compute',plan:plan.name,
   before:{maxCu:0},after:{maxCu:a.maxCu??0.25}});
 },
 plan:async(a,c)=>{
  if(c.connection.projectScope||!nameOk(a.name)||
     (a.maxCu!==undefined&&(!Number.isFinite(a.maxCu)||a.maxCu<0.25||a.maxCu>16))||
     (a.regionId!==undefined&&!id.test(a.regionId)))
   throw Error('Invalid project creation request');
  const org=await c.db.getNeonOrg(c.connection.neonOrg);
  if(!org)throw Error('Organization unavailable');
  return {target:'project:create:'+c.connection.neonOrg+':'+a.name,
   projectId:null,before:{name:a.name},
   summary:'Create new Neon project '+a.name+' at max '+(a.maxCu??0.25)+' CU; may incur charges'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const client=await c.clientFor(null);
  const body={project:{name:a.name,org_id:c.connection.neonOrg,
   default_endpoint_settings:{autoscaling_limit_min_cu:0.25,
    autoscaling_limit_max_cu:a.maxCu??0.25,suspend_timeout_seconds:300},
   ...(a.regionId?{region_id:a.regionId}:{})}};
  const result=await call(client,'createProject',{body},{write:true,requestKey:key});
  if(result.error)return {confirmed:result.confirmed===null?'pending':false};
  if(result.data?.project?.org_id!==c.connection.neonOrg||
    !id.test(result.data?.project?.id))return {confirmed:'pending'};
  c.createdProjectId=result.data.project.id;
  const secret=result.data.connection_uris?.[0]?.connection_uri;
  if(typeof secret==='string'&&secret.startsWith('postgres')){
   c.oneTime=await createOneTimeSecrets({db:c.db,env:c.env}).putOneTimeSecret({
    org:c.connection.neonOrg,kind:'connection_uri',label:'New project '+a.name,secret});
  }
  if(result.operations?.length){
   const done=await waitForOperations(client,c.createdProjectId,result.operations,{budgetMs:15000});
   return {confirmed:done.confirmed===true?true:'pending',operations:done.operations};
  }
  return {confirmed:true,operations:[]};
 },
 readAfter:async(_a,c)=>c.createdProjectId?read(c,c.createdProjectId):null,
 verify:(before,after)=>after?.name===before.name&&!!after?.id
});
const definitions=[
 [rename,{description:'Safely rename a project after preview and protected/production checks.',
  inputSchema:schema({projectId:ids,name:text},['name'])},{profiles:['everyday','full']}],
 [del,{description:'Preview every branch and database before a recoverable project deletion.',
  inputSchema:schema({projectId:ids},[])},{profiles:['full'],key:'org'}],
 [recover,{description:'Recover a soft-deleted project within its Neon recovery window.',
  inputSchema:schema({projectId:ids},[])},{profiles:['full'],key:'org'}],
 [create,{description:'Create a project with an audited dollar estimate and one-time secret link.',
  inputSchema:schema({name:text,regionId:ids,maxCu:{type:'number',minimum:0.25,maximum:16}},['name'])},
  {profiles:['full'],key:'org',secret:true}]
];
export const tools=definitions.map(([def,extra,opt])=>make(def,extra,opt));
export function createProjectWriteHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(definitions.map(([def,_extra,options])=>[def.tool.name,async(args,ctx)=>{
  const writeCtx=await contextFor(ctx,{keyNeed:options.key||null});
  const result=await def.handler(args,writeCtx);
  if(def===create&&writeCtx.oneTime&&result.isError!==true){
   const parsed=JSON.parse(result.content[0].text);
   if(parsed.done===true)result.content[0].text=JSON.stringify({
    ...parsed,oneTimeSecretLink:writeCtx.oneTime.link});
  }
  return result;
 }]));
}
export const handlers=createProjectWriteHandlers();
