// B-6: only registry metadata and trusted connection scope determine visibility.
const profiles=new Set(['read_only','everyday','full']);
const internalControls=new Set(['neon_enable_production','neon_disable_production','neon_revoke_connection','neon_update_settings']);
const externalProjectWrites=new Set(['neon_project_create','neon_project_rename',
 'neon_project_delete','neon_project_recover',
 'neon_project_update_settings','neon_project_set_history_retention',
 'neon_project_set_quotas','neon_branch_rename','neon_branch_set_protected',
 'neon_branch_set_expiration','neon_branch_set_default',
 'neon_branch_create','neon_branch_delete','neon_branch_recover',
 'neon_branch_reset_from_parent','neon_branch_restore',
 'neon_compute_create','neon_compute_resize']);
export function isToolAllowed(tool, connection, {productionDeployment=false}={}) {
  if(!tool || !profiles.has(connection?.profile) ||
      !Array.isArray(tool.profiles) || !tool.profiles.includes(connection.profile))return false;
  if(tool.key==='org' && connection.profile!=='full')return false;
  if(tool.writes===false)return tool.name!=='neon_check_key_access' ||
    (connection.profile==='full' && productionDeployment);
  if(tool.writes!==true || connection.profile==='read_only')return false;
  // Every listed external mutation still runs its full B-1 guard chain and owner gates.
  return productionDeployment && (externalProjectWrites.has(tool.name)||
  (internalControls.has(tool.name)&&connection.profile==='full'));
}
export function profileToolCounts(tools,{productionDeployment=false}={}){
  return Object.fromEntries([...profiles].map(profile=>[profile,tools.filter(t=>
    isToolAllowed(t,{profile},{productionDeployment})).length]));
}
