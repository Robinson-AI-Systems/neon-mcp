// C-1: small stable summaries of common Neon resource types; unknown shapes remain intact.
const fields=Object.freeze({
 project:['id','name','region_id','platform_id','created_at','updated_at','status'],
 branch:['id','name','parent_id','default','protected','production','created_at','updated_at'],
 endpoint:['id','branch_id','type','current_state','autoscaling_limit_min_cu',
  'autoscaling_limit_max_cu','created_at'],
 database:['id','name','owner_name','branch_id'],
 role:['name','branch_id','protected'],
 operation:['id','action','status','created_at','updated_at']
});
const single=Object.freeze({projects:'project',branches:'branch',endpoints:'endpoint',
 databases:'database',roles:'role',operations:'operation'});
export function summarizeResources(value){
 function walk(node,kind,depth=0){
  if(depth>30)return null;
  if(Array.isArray(node))return node.map(x=>walk(x,kind,depth+1));
  if(!node||typeof node!=='object')return node;
  if(kind && fields[kind]){
   return Object.fromEntries(fields[kind].filter(key=>Object.hasOwn(node,key))
     .map(key=>[key,node[key]]));
  }
  return Object.fromEntries(Object.entries(node).map(([key,item])=>{
   const type=single[key] || (fields[key]?key:null);
   return [key,type?walk(item,type,depth+1):item];
  }));
 }
 return walk(value,null);
}
