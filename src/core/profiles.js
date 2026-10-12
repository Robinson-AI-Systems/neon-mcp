// B-6: only registry metadata and trusted connection scope determine visibility.
const profiles=new Set(['read_only','everyday','full']);
const internalControls=new Set(['neon_enable_production','neon_disable_production','neon_revoke_connection','neon_update_settings']);
const externalProjectWrites=new Set(['neon_project_create','neon_project_rename',
 'neon_project_delete','neon_project_recover']);
export function isToolAllowed(tool, connection, {productionDeployment=false}={}) {
  if(!tool || !profiles.has(connection?.profile) ||
      !Array.isArray(tool.profiles) || !tool.profiles.includes(connection.profile))return false;
  if(tool.key==='org' && connection.profile!=='full')return false;
  if(tool.writes===false)return tool.name!=='neon_check_key_access' ||
    (connection.profile==='full' && productionDeployment);
  if(tool.writes!==true || connection.profile==='read_only')return false;
  // Public Neon write gateway remains deferred; this allowlist covers only server-local controls.
  return productionDeployment && (externalProjectWrites.has(tool.name)||
  (internalControls.has(tool.name)&&connection.profile==='full'));
}
export function profileToolCounts(tools,{productionDeployment=false}={}){
  return Object.fromEntries([...profiles].map(profile=>[profile,tools.filter(t=>
    isToolAllowed(t,{profile},{productionDeployment})).length]));
}
