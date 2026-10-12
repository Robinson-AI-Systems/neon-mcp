// D-3: identity-verified, credential-free compute discovery and hypothetical pricing.
import {projectScope,projectClient,projectRead,operationSummary} from './project-context.js';
import {defineReadTool,readId,readText} from './read-descriptors.js';
import {validatePricing} from '../neon/pricing.js';
const id=/^[a-z0-9-]{1,60}$/;
const cu={type:'number',minimum:0.25,maximum:16};
export const tools=[
 defineReadTool('neon_compute_list','List verified compute endpoints and safe operational settings.',{
  projectId:readId,branchId:readId,limit:{type:'integer',minimum:1,maximum:100}}),
 defineReadTool('neon_compute_get','Get one verified compute and its recent operations.',{
  projectId:readId,endpointId:readId,branchId:readId}),
 defineReadTool('neon_compute_estimate_cost','Estimate a hypothetical CU size and active hours using stored dated pricing; never authorizes spend.',{
  plan:{type:'string',enum:['Launch','Scale']},minCu:cu,maxCu:cu,
  hoursPerDay:{type:'number',minimum:0,maximum:24}})
];
export function safeCompute(e){
 return {id:e.id,projectId:e.project_id,branchId:e.branch_id,type:e.type,
  state:e.current_state??null,pendingState:e.pending_state??null,
  minCu:e.autoscaling_limit_min_cu??null,maxCu:e.autoscaling_limit_max_cu??null,
  suspendSeconds:e.suspend_timeout_seconds??null,
  poolerEnabled:e.pooler_enabled===true,disabled:e.disabled===true,
  lastActive:e.last_active??null,updatedAt:e.updated_at??null};
}
function verified(e,projectId){
 if(!e||!id.test(e.id||'')||e.project_id!==projectId||!id.test(e.branch_id||''))
  throw Error('Compute endpoint identity does not match the scoped project');
 return e;
}
async function clientAndProject(args,ctx,getClient){
 const scope=projectScope(ctx,args.projectId??null);
 if(!scope.projectId)throw Error('Choose a scoped project');
 const {client}=await getClient(ctx,scope.projectId);
 const response=await projectRead(client,'getProject',{
  path:{project_id:scope.projectId}});
 if(response?.project?.id!==scope.projectId||response.project.org_id!==scope.org)
  throw Error('Project organization identity cannot be verified');
 return {client,projectId:scope.projectId};
}
export function createComputeReadHandlers({getClient=projectClient}={}){
 return {
  async neon_compute_list(args,ctx){
   if(args.branchId!==undefined&&!id.test(args.branchId))throw Error('Invalid branch ID');
   const {client,projectId}=await clientAndProject(args,ctx,getClient);
   if(args.branchId){
    const b=await projectRead(client,'getProjectBranch',{
     path:{project_id:projectId,branch_id:args.branchId}});
    if(b?.branch?.id!==args.branchId||b.branch.project_id!==projectId)
     throw Error('Branch identity cannot be verified');
   }
   const data=await projectRead(client,'listProjectEndpoints',{
    path:{project_id:projectId}});
   if(!Array.isArray(data?.endpoints))throw Error('Compute listing unavailable');
   const endpoints=data.endpoints.map(e=>verified(e,projectId));
   const selected=args.branchId?endpoints.filter(e=>e.branch_id===args.branchId):endpoints;
   const limit=args.limit??50;
   return readText({projectId,branchId:args.branchId??null,
    computes:selected.slice(0,limit).map(safeCompute),returned:Math.min(selected.length,limit),
    capped:selected.length>limit});
  },
  async neon_compute_get(args,ctx){
   if(!id.test(args.endpointId||'')||
     (args.branchId!==undefined&&!id.test(args.branchId)))
    throw Error('Invalid compute or branch ID');
   const {client,projectId}=await clientAndProject(args,ctx,getClient);
   const e=verified((await projectRead(client,'getProjectEndpoint',{
    path:{project_id:projectId,endpoint_id:args.endpointId}}))?.endpoint,projectId);
   if(e.id!==args.endpointId||(args.branchId&&e.branch_id!==args.branchId))
    throw Error('Compute belongs to a different branch or endpoint');
   const operations=await projectRead(client,'listProjectOperations',{
    path:{project_id:projectId},query:{limit:100}});
   if(!Array.isArray(operations?.operations)||
      operations.operations.some(op=>op.project_id!==projectId))
    throw Error('Compute operations cannot be verified');
   const matching=operations.operations.filter(op=>op.endpoint_id===e.id);
   return readText({compute:safeCompute(e),
    operations:matching.slice(0,20).map(operationSummary),
    operationsCapped:matching.length>20||Boolean(operations.pagination?.cursor)});
  },
  async neon_compute_estimate_cost(args,ctx){
   projectScope(ctx,null); // no organization crossover, even for hypothetical estimates
   if(!['Launch','Scale'].includes(args.plan)||
      ![args.minCu,args.maxCu,args.hoursPerDay].every(Number.isFinite)||
      args.minCu<0.25||args.maxCu>16||args.minCu>args.maxCu||
      args.hoursPerDay<0||args.hoursPerDay>24)
    throw Error('Specify supported plan, CU range and hours per day');
   const pricing=validatePricing(await ctx.db?.getPricing?.());
   const rate=args.plan==='Launch'?pricing.ratesMicro.launchCuHour:
    pricing.ratesMicro.scaleCuHour;
   const hours=args.hoursPerDay*365/12;
   const monthlyCents=cuSize=>Math.ceil(cuSize*hours*rate/10000);
   const min=monthlyCents(args.minCu),max=monthlyCents(args.maxCu);
   return readText({assumedPlan:args.plan,source:pricing.source,
    priceCheckedAt:pricing.checkedAt,activeHoursMonthly:hours,
    minMonthlyCents:min,maxMonthlyCents:max,
    minMonthlyDisplay:'$'+(min/100).toFixed(2),
    maxMonthlyDisplay:'$'+(max/100).toFixed(2),
    hypothetical:true,authorizesSpending:false});
  }
 };
}
export const handlers=createComputeReadHandlers();
