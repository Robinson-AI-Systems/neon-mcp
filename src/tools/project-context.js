// D-1: project discovery through a trusted, connection-bound encrypted key.
import {createKeyVault} from '../neon/keys.js';
import {makeNeonClient,call} from '../neon/client.js';
import {makeNeonBudget} from '../neon/budget.js';

const ID=/^[a-z0-9-]{1,60}$/;
export function projectScope(ctx,projectId=null) {
 const org=ctx?.connection?.neonOrg ?? ctx?.connection?.neon_org;
 const scoped=ctx?.connection?.projectScope ?? ctx?.connection?.project_scope ?? null;
 if(!ID.test(org||'')||(scoped&&!ID.test(scoped))||
    (projectId!==null&&!ID.test(projectId))||
    (scoped&&projectId&&scoped!==projectId))
  throw new Error('Project is outside this connection scope');
 if(!scoped&&ctx?.connection?.profile!=='full')
  throw new Error('Unscoped project access requires the owner profile');
 return {org,scoped,projectId:scoped||projectId};
}
export async function projectClient(ctx,projectId=null){
 const s=projectScope(ctx,projectId);
 const saved=await createKeyVault({db:ctx.db,env:ctx.env}).keyFor({
  orgId:s.org,projectId:s.scoped,need:s.scoped?'project':'org'});
 if(!saved.key)throw new Error('A verified scoped key is unavailable');
 return {client:makeNeonClient({key:saved.key,orgId:s.org,
  budget:makeNeonBudget({db:ctx.db,apiKey:saved.key})}),scope:s};
}
export function projectSummary(p){
 return {id:p.id,name:p.name,organizationId:p.org_id||null,region:p.region_id||null,
  postgresVersion:p.pg_version||null,createdAt:p.created_at||null,
  updatedAt:p.updated_at||null,historyRetentionSeconds:p.history_retention_seconds??null,
  dataStorageBytesHour:p.data_storage_bytes_hour??null};
}
export function branchSummary(b){
 return {id:b.id,name:b.name,default:b.default===true,protected:b.protected===true,
  parentId:b.parent_id||null,state:b.current_state||null,
  logicalSizeBytes:b.logical_size??null,updatedAt:b.updated_at||null,
  expiresAt:b.expires_at||null};
}
export function computeSummary(e){
 return {id:e.id,branchId:e.branch_id,state:e.current_state||null,type:e.type||null,
  minCu:e.autoscaling_limit_min_cu??null,maxCu:e.autoscaling_limit_max_cu??null};
}
export function operationSummary(o){
 return {id:o.id,projectId:o.project_id,branchId:o.branch_id||null,
  action:o.action,status:o.status,createdAt:o.created_at,updatedAt:o.updated_at,
  failures:o.failures_count??0};
}
export async function projectRead(client,operationId,params={}){
 const reply=await call(client,operationId,params);
 if(reply.error)throw new Error('Neon could not return the requested project information');
 return reply.data;
}
// Neon's pagination uses pagination.cursor, not the old generic pagination.next field.
// Never return partial success if the provider fails, repeats a cursor or exceeds the cap.
export async function projectPages(client,operationId,base,collection,{max=100}={}){
 const values=[],seen=new Set();let cursor=null;
 for(let page=0;page<20&&values.length<max;page++){
  const data=await projectRead(client,operationId,{
   ...base,query:{...base.query,limit:Math.min(100,max-values.length),
    ...(cursor?{cursor}:{})}});
  const items=data?.[collection];
  if(!Array.isArray(items))throw new Error('Neon returned an invalid collection');
  values.push(...items.slice(0,max-values.length));
  const next=data.pagination?.cursor??null;
  if(!next)return {items:values,capped:false};
  if(typeof next!=='string'||seen.has(next))
   throw new Error('Neon returned a repeated pagination cursor');
  seen.add(next);cursor=next;
 }
 return {items:values,capped:true};
}
