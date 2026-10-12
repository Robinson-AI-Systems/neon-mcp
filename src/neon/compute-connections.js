// D-3: independently verified PostgreSQL session count for disruption previews.
// Never count an unverified pooler, wrong endpoint, or partial-statistics role.
import {projectRead} from '../tools/project-context.js';
import {createSqlLayer} from './sql.js';
import {createKeyVault} from './keys.js';

const id=/^[a-z0-9-]{1,60}$/;
const sqlName=/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
export function createVerifiedComputeConnectionCount({
 connection,db,env=process.env,clientFor,sqlLayer
}={}){
 if(!connection?.neonOrg||!db||typeof clientFor!=='function')
  throw new TypeError('Trusted organization, database and Neon client required');
 return async function readComputeConnectionCount({projectId,branchId,endpointId}={}){
  if(![projectId,branchId,endpointId].every(x=>id.test(x||''))||
     connection.projectScope&&connection.projectScope!==projectId)
   throw Error('Compute connection count requires exact scoped identities');
  const client=await clientFor(projectId);
  const [p,b,e]=await Promise.all([
   projectRead(client,'getProject',{path:{project_id:projectId}}),
   projectRead(client,'getProjectBranch',{path:{project_id:projectId,branch_id:branchId}}),
   projectRead(client,'getProjectEndpoint',{path:{project_id:projectId,endpoint_id:endpointId}})
  ]);
  if(p?.project?.id!==projectId||p.project.org_id!==connection.neonOrg||
     b?.branch?.id!==branchId||b.branch.project_id!==projectId||
     e?.endpoint?.id!==endpointId||e.endpoint.project_id!==projectId||
     e.endpoint.branch_id!==branchId)
   throw Error('Compute connection target is not independently verified');
  // Poolers may hold sessions invisible to pg_stat_activity. No partial counts.
  if(e.endpoint.pooler_enabled!==false||
     typeof e.endpoint.host!=='string'||!e.endpoint.host.includes('.'))
   throw Error('Complete unpooled compute connection visibility is unavailable');
  const path={project_id:projectId,branch_id:branchId};
  const [dbs,roles]=await Promise.all([
   projectRead(client,'listProjectBranchDatabases',{path}),
   projectRead(client,'listProjectBranchRoles',{path})
  ]);
  if(!Array.isArray(dbs?.databases)||!Array.isArray(roles?.roles)||
     dbs.databases.some(x=>x.branch_id!==branchId)||
     roles.roles.some(x=>x.branch_id!==branchId))
   throw Error('Database and role inventory cannot be verified');
  const known=new Set(roles.roles.map(x=>x.name));
  const selected=dbs.databases
   .filter(x=>sqlName.test(x.name||'')&&sqlName.test(x.owner_name||'')&&
     known.has(x.owner_name))
   .sort((a,b)=>a.name.localeCompare(b.name))[0];
  if(!selected)throw Error('No independently verified monitoring database and role');
  const run=sqlLayer??createSqlLayer({db,vault:createKeyVault({db,env}),env});
  const result=await run({neonOrg:connection.neonOrg,
   projectScope:connection.projectScope??null},{
   projectId,branchId,endpointId,database:selected.name,role:selected.owner_name,
   expectedEndpointHost:e.endpoint.host,pooled:false},async client=>{
   const grant=await client.query("SELECT pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER') AS visible");
   if(grant?.rows?.length!==1||grant.rows[0].visible!==true)
    throw Error('Full connection statistics privilege not verified');
   const result=await client.query(
    "SELECT count(*)::text AS total FROM pg_stat_activity WHERE backend_type = 'client backend'");
   return {total:result?.rows?.length===1?result.rows[0].total:null};
  });
  if(typeof result?.total!=='string'||!/^(0|[1-9][0-9]{0,14})$/.test(result.total))
   throw Error('Complete active connection count unavailable');
  const count=Number(result.total);
  if(!Number.isSafeInteger(count))throw Error('Unsafe active connection count');
  // Includes this monitoring session, deliberately overestimating disruption.
  return count;
 };
}
