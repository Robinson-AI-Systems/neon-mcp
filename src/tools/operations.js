// D-1b: operation inspection and safe project settings, never write to Neon.
import {projectScope,projectClient,projectRead,projectPages,operationSummary} from './project-context.js';
import {waitForOperations} from '../neon/operations.js';
const profiles=['read_only','everyday','full'];
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const schema=properties=>({type:'object',properties,additionalProperties:false});
const text=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const read=(name,description,properties)=>({name,description,writes:false,profiles,
 area:'projects',audience:['builder','owner','operator'],inputSchema:schema(properties)});
export const tools=[
 read('neon_operation_list','List bounded operation history for an allowed project, with optional local filters.',{
  projectId:id,branchId:id,computeId:id,limit:{type:'integer',minimum:1,maximum:100}}),
 read('neon_operation_get','Inspect an operation, optionally waiting at most 45 seconds for terminal status.',{
  projectId:id,operationId:id,waitSeconds:{type:'integer',minimum:0,maximum:45}}),
 read('neon_project_get_settings','View nonsecret project history, quotas and settings for an allowed project.',{
  projectId:id})
];
function target(ctx,args){
 const s=projectScope(ctx,args.projectId??null);
 if(!s.projectId)throw new Error('A project must be selected');
 return s;
}
function configuration(p){
 // Explicit allowlist: no auth details, role passwords, connection URIs or provider blobs.
 return {id:p.id,name:p.name,region:p.region_id||null,postgresVersion:p.pg_version??null,
  historyRetentionSeconds:p.history_retention_seconds??null,
  branchLogicalSizeLimitBytes:p.branch_logical_size_limit_bytes??null,
  defaultEndpointSettings:{
   pgSettings:p.default_endpoint_settings?.pg_settings||{},
   autoscalingLimitMinCu:p.default_endpoint_settings?.autoscaling_limit_min_cu??null,
   autoscalingLimitMaxCu:p.default_endpoint_settings?.autoscaling_limit_max_cu??null,
   suspendTimeoutSeconds:p.default_endpoint_settings?.suspend_timeout_seconds??null
  },maintenanceWindow:p.settings?.maintenance_window||null,
  preloadLibraries:p.settings?.preload_libraries||null,
  quotas:p.settings?.quota?{
   activeTimeSeconds:p.settings.quota.active_time_seconds??null,
   computeTimeSeconds:p.settings.quota.compute_time_seconds??null,
   dataTransferBytes:p.settings.quota.data_transfer_bytes??null,
   writtenDataBytes:p.settings.quota.written_data_bytes??null,
   logicalSizeBytes:p.settings.quota.logical_size_bytes??null}:null};
}
export function createOperationHandlers({getClient=projectClient,wait=waitForOperations}={}){
 return {
  async neon_operation_list(args,ctx){
   const scoped=target(ctx,args);
   const {client}=await getClient(ctx,scoped.projectId);
   const page=await projectPages(client,'listProjectOperations',
    {path:{project_id:scoped.projectId}},'operations',{max:Math.min(100,args.limit??50)});
   if(page.items.some(o=>o.project_id!==scoped.projectId))
    throw new Error('Operation did not belong to the requested project');
   const operations=page.items.filter(o=>(!args.branchId||o.branch_id===args.branchId)&&
    (!args.computeId||o.endpoint_id===args.computeId)).map(operationSummary);
   return text({operations,capped:page.capped,filtered:!!(args.branchId||args.computeId)});
  },
  async neon_operation_get(args,ctx){
   const scoped=target(ctx,args);
   if(!id.pattern||typeof args.operationId!=='string'||!/^[a-z0-9-]{1,60}$/.test(args.operationId)||
      !Number.isInteger(args.waitSeconds??0)||(args.waitSeconds??0)<0||(args.waitSeconds??0)>45)
    throw new Error('Invalid operation query');
   const {client}=await getClient(ctx,scoped.projectId);
   const data=await projectRead(client,'getProjectOperation',{
    path:{project_id:scoped.projectId,operation_id:args.operationId}});
   const op=data?.operation;
   if(op?.project_id!==scoped.projectId||op.id!==args.operationId)
    throw new Error('Operation scope could not be verified');
   if(!args.waitSeconds||['finished','skipped','failed','cancelled','error'].includes(op.status))
    return text({operation:operationSummary(op),done:['finished','skipped'].includes(op.status)});
   const result=await wait(client,scoped.projectId,[op],{budgetMs:args.waitSeconds*1000});
   return text({done:result.done,operation:operationSummary(result.operations?.find(x=>x.id===op.id)??op),
    ...(result.done==='pending'?{next:'Call neon_operation_get again'}:{})});
  },
  async neon_project_get_settings(args,ctx){
   const scoped=target(ctx,args);
   const {client}=await getClient(ctx,scoped.projectId);
   const data=await projectRead(client,'getProject',{path:{project_id:scoped.projectId}});
   if(data?.project?.id!==scoped.projectId||data.project.org_id!==scoped.org)
    throw new Error('Project scope could not be verified');
   return text({settings:configuration(data.project)});
  }
 };
}
export const handlers=createOperationHandlers();
