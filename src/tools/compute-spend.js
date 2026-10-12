// D-3: every compute create/resize is a durable, cost-checked Neon write.
import {defineWrite} from '../core/write.js';
import {projectScope,projectRead} from './project-context.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';
import {createSpendGuard} from '../neon/spend.js';
const ID=/^[a-z0-9-]{1,60}$/;
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const cu={type:'number',minimum:0.25,maximum:16};
const opts={projectId:id,branchId:id,endpointId:id,dryRun:{type:'boolean'},
 confirm:{type:'boolean'},outsideApp:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}};
const schema=(props,required)=>({type:'object',properties:{...opts,...props},
 required,additionalProperties:false});
function targetId(a,c){
 const p=projectScope(c,a.projectId??null).projectId;
 if(!p)throw Error('A scoped project is required');
 return p;
}
async function project(a,c){
 const pid=targetId(a,c),client=await c.clientFor(pid);
 const response=await projectRead(client,'getProject',{path:{project_id:pid}});
 if(response?.project?.id!==pid||response.project.org_id!==c.connection.neonOrg)
  throw Error('Project identity cannot be verified');
 return {pid,client};
}
async function branch(client,pid,bid){
 if(!ID.test(bid||''))throw Error('Valid branch ID required');
 const data=await projectRead(client,'getProjectBranch',{
  path:{project_id:pid,branch_id:bid}});
 if(data?.branch?.id!==bid||data.branch.project_id!==pid)
  throw Error('Branch identity cannot be verified');
 return data.branch;
}
export async function verifiedComputeTarget(a,c){
 if(!ID.test(a.endpointId||''))throw Error('Choose an endpoint');
 const {pid,client}=await project(a,c);
 const data=await projectRead(client,'getProjectEndpoint',{
  path:{project_id:pid,endpoint_id:a.endpointId}});
 const e=data?.endpoint;
 if(e?.id!==a.endpointId||e.project_id!==pid||!ID.test(e.branch_id||'')||
   (a.branchId&&a.branchId!==e.branch_id))
  throw Error('Compute endpoint scope cannot be verified');
 await branch(client,pid,e.branch_id);
 return {pid,client,e};
}
function size(a){
 if(![a.minCu,a.maxCu].every(v=>typeof v==='number'&&Number.isFinite(v)&&
    v>=0.25&&v<=16)||a.minCu>a.maxCu)
  throw Error('Supported compute CU minimum and maximum required');
}
async function estimate(_a,c,before){
 const verified=typeof c.db.getVerifiedNeonPlan==='function'
  ?await c.db.getVerifiedNeonPlan(c.connection.neonOrg):await c.planFor?.();
 if(verified?.verified!==true||!['Launch','Scale'].includes(verified.name))
  return null;
 return createSpendGuard({db:c.db}).price({kind:'compute',plan:verified.name,
  before:{maxCu:before.maxCu},after:{maxCu:before.targetMaxCu}});
}
const create=defineWrite({name:'neon_compute_create',spend:estimate,
 plan:async(a,c)=>{
  size(a);
  if(!['read_only','read_write'].includes(a.type))
   throw Error('Choose a compute type');
  const {pid,client}=await project(a,c);
  const b=await branch(client,pid,a.branchId);
  const data=await projectRead(client,'listProjectBranchEndpoints',{
   path:{project_id:pid,branch_id:b.id}});
  if(!Array.isArray(data?.endpoints)||data.endpoints.some(e=>
      e.project_id!==pid||e.branch_id!==b.id))
   throw Error('Complete compute inventory required');
  if(a.type==='read_write'&&data.endpoints.some(e=>e.type==='read_write'))
   throw Error('A read-write compute already belongs to this branch');
  return {projectId:pid,branchId:b.id,target:'branch:'+b.id,
   before:{maxCu:0,targetMaxCu:a.maxCu,branchId:b.id,type:a.type,
    minCu:a.minCu},
   summary:'Create '+a.type+' compute on verified '+b.id+', range '+
    a.minCu+'–'+a.maxCu+' CU; maximum monthly billable cost is previewed'};
 },
 apply:async(a,c,{requestKey:key})=>{
  const pid=targetId(a,c);
  const out=await applyNeonWrite({client:await c.clientFor(pid),
   operationId:'createProjectEndpoint',projectId:pid,requestKey:key,
   params:{path:{project_id:pid},body:{endpoint:{branch_id:a.branchId,
    type:a.type,autoscaling_limit_min_cu:a.minCu,
    autoscaling_limit_max_cu:a.maxCu}}}});
  if(out.data?.endpoint?.project_id===pid&&ID.test(out.data.endpoint.id))
   c.createdComputeId=out.data.endpoint.id;
  return out;
 },
 readAfter:async(a,c)=>{
  if(!c.createdComputeId)return null;
  const {pid,client}=await project(a,c);
  return (await projectRead(client,'getProjectEndpoint',{
   path:{project_id:pid,endpoint_id:c.createdComputeId}})).endpoint;
 },
 verify:(before,after)=>after?.project_id!==undefined&&
  after.branch_id===before.branchId&&after.type===before.type&&
  after.autoscaling_limit_min_cu===before.minCu&&
  after.autoscaling_limit_max_cu===before.targetMaxCu&&ID.test(after.id||'')
});
const resize=defineWrite({name:'neon_compute_resize',spend:estimate,
 plan:async(a,c)=>{
  size(a);
  const {pid,e}=await endpoint(a,c);
  if(!Number.isFinite(e.autoscaling_limit_max_cu)||
     !Number.isFinite(e.autoscaling_limit_min_cu)||e.pending_state)
   throw Error('Current compute range or pending state cannot be verified');
  if(e.autoscaling_limit_min_cu===a.minCu&&e.autoscaling_limit_max_cu===a.maxCu)
   throw Error('Compute size is unchanged');
  return {projectId:pid,branchId:e.branch_id,target:'branch:'+e.branch_id,
   before:{id:e.id,branchId:e.branch_id,maxCu:e.autoscaling_limit_max_cu,
    targetMaxCu:a.maxCu,minCu:a.minCu,projectId:pid},
   summary:'Resize '+e.id+' from max '+e.autoscaling_limit_max_cu+
    ' to '+a.minCu+'–'+a.maxCu+' CU; dropping CU can slow applications'};
 },
 apply:async(a,c,{requestKey:key})=>applyNeonWrite({
  client:await c.clientFor(targetId(a,c)),operationId:'updateProjectEndpoint',
  projectId:targetId(a,c),requestKey:key,params:{
   path:{project_id:targetId(a,c),endpoint_id:a.endpointId},
   body:{endpoint:{autoscaling_limit_min_cu:a.minCu,
    autoscaling_limit_max_cu:a.maxCu}}}}),
 readAfter:async(a,c)=>(await endpoint(a,c)).e,
 verify:(before,after)=>after?.id===before.id&&
  after.project_id===before.projectId&&after.branch_id===before.branchId&&
  after.autoscaling_limit_min_cu===before.minCu&&
  after.autoscaling_limit_max_cu===before.targetMaxCu
});
const definitions=[
 [create,'Create a compute using audited worst-case monthly CU spending.',
  schema({type:{type:'string',enum:['read_only','read_write']},minCu:cu,maxCu:cu},
   ['branchId','type','minCu','maxCu'])],
 [resize,'Change a compute range after independently verified pricing and confirmation.',
  schema({minCu:cu,maxCu:cu},['endpointId','minCu','maxCu'])]
];
export const tools=definitions.map(([def,description,inputSchema])=>({...def.tool,
 description,inputSchema,profiles:['full'],area:'computes',audience:['owner','operator']}));
export function createComputeSpendHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(definitions.map(([def])=>[def.tool.name,
  async(a,c)=>def.handler(a,await contextFor(c))]));
}
export const handlers=createComputeSpendHandlers();
