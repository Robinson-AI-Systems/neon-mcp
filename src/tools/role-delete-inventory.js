// D-4: authorize and verify a complete Neon/PostgreSQL role deletion preview.
// This is only a preflight, NEVER an implicit authorization to delete anything.
import {projectScope,projectRead} from './project-context.js';
import {roleName,existingRole,rolesOnBranch} from './role-write-shared.js';
import {classifyTarget} from '../neon/production.js';
import {checkProtectedTarget} from '../core/protected-resources.js';
import {runGuardedRoleDependencyProbe} from '../neon/sql-run.js';

const id = x => typeof x==='string' && /^[a-z0-9-]{1,60}$/.test(x);
const name = x => typeof x==='string' && /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(x);
const host = x => typeof x==='string' && /^[A-Za-z0-9.-]{4,255}$/.test(x) &&
  x.includes('.') && !x.includes('..');
function complete(list,key,max,validate,identity){
  if(!Array.isArray(list?.[key]) || list.pagination?.cursor ||
      list[key].length > max || !list[key].every(validate))
    throw Error('Complete Neon role deletion inventory unavailable');
  // Duplicate identities can mask missing resources in provider inventories;
  // fail closed rather than treating repeated rows as separate evidence.
  const identifiers=list[key].map(identity);
  if(identifiers.some(x=>typeof x!=='string'||!x)||
      new Set(identifiers).size!==identifiers.length)
    throw Error('Duplicated Neon role deletion inventory identity');
  return list[key];
}
async function authorize(a,c){
  // No SQL or URI read in preview until the same B-2/B-3 owner gates
  // needed by the actual destructive action are verified by trusted services.
  const p=projectScope({connection:c.connection},a.projectId??null);
  if(c.connection?.profile!=='full'||!id(p.projectId)||!id(a.branchId)||
      typeof c.db?.getSqlReadPolicy!=='function')
    throw Error('Full owner, exact project/branch and SQL read policy required');
  const t={projectId:p.projectId,branchId:a.branchId,target:'branch:'+a.branchId};
  if(await checkProtectedTarget(t,c)!==true)
    throw Error('Role deletion target is protected');
  const cls=await classifyTarget(c,t);
  if(cls.allowed!==true)throw Error('Branch classification unverified');
  const policy=await c.db.getSqlReadPolicy();
  if(!policy||typeof policy.productionReads!=='boolean'||
      !Number.isSafeInteger(policy.maxRows)||policy.maxRows<1||policy.maxRows>200||
      cls.production&&!policy.productionReads)
    throw Error('SQL monitoring reads are not owner-authorized');
  if(await c.guards?.checkApp?.(t,c,a)!==true)
    throw Error('Role deletion target may be application-owned');
  const approved=await c.guards?.checkProduction?.(t,c,{
    name:'neon_role_delete',productionEffect:'write'});
  if(approved?.allowed!==true||typeof approved.production!=='boolean')
    throw Error('Destructive role action requires owner-approved production policy');
  return p;
}
async function defaultSqlInspect(a,c,t,ep,db,monitor){
  return runGuardedRoleDependencyProbe(a,c,t,ep,db,monitor);
}
export async function inspectRoleDeleteReadiness(a,c,{
  inspectEndpoint=defaultSqlInspect,retirement=false
}={}){
  if(!roleName(a?.roleName))throw Error('A valid role is required for deletion');
  const scope=await authorize(a,c);
  const t=await existingRole(a,c);
  if(retirement&&t.role.protected!==false)throw Error('Role protection unverified');
  if(t.pid!==scope.projectId)throw Error('Verified role project is outside owner scope');
  const [allEndpoints,allDatabases,allRoles]=await Promise.all([
    projectRead(t.client,'listProjectEndpoints',{path:{project_id:t.pid}}),
    projectRead(t.client,'listProjectBranchDatabases',{path:t.path}),
    rolesOnBranch(t)
  ]);
  const endpoints=complete(allEndpoints,'endpoints',32,
    e=>id(e.id)&&id(e.branch_id)&&e.project_id===t.pid,e=>e.id);
  const databases=complete(allDatabases,'databases',100,
    d=>d.branch_id===t.bid&&name(d.name)&&roleName(d.owner_name),d=>d.name);
  const known=complete({roles:allRoles},'roles',100,
    x=>x.branch_id===t.bid&&roleName(x.name),x=>x.name);
  const active=endpoints.filter(e=>e.branch_id===t.bid);
  if(!active.length||active.length>16||
      active.some(e=>(!retirement&&e.pooler_enabled!==false)||e.disabled!==false||
        e.current_state!=='active'||!host(e.host)||
        (retirement?!['read_write','read_only'].includes(e.type):e.type!=='read_write')))
    throw Error('Each dependent compute must be active, direct, unpooled and independently verifiable; no compute is started automatically');
  const monitorDb=databases.find(d=>d.name===a.monitorDatabase&&
    d.owner_name===a.monitorRole&&known.some(r=>r.name===a.monitorRole));
  if(!monitorDb||!name(a.monitorDatabase)||!roleName(a.monitorRole)||
      a.roleName===a.monitorRole)
    throw Error('Choose a verified separate monitoring database and owner role');
  const [d,m]=await Promise.all([
    projectRead(t.client,'getProjectBranchDatabase',{
      path:{...t.path,database_name:a.monitorDatabase}}),
    projectRead(t.client,'getProjectBranchRole',{
      path:{...t.path,role_name:a.monitorRole}})
  ]);
  if(d?.database?.name!==monitorDb.name||d.database.branch_id!==t.bid||
      d.database.owner_name!==a.monitorRole||
      m?.role?.name!==a.monitorRole||m.role.branch_id!==t.bid)
    throw Error('Monitoring database and role must be independently verified');
  const findings=[];
  for(const ep of active){
    const exact=await projectRead(t.client,'getProjectEndpoint',{
      path:{project_id:t.pid,endpoint_id:ep.id}});
    if(exact?.endpoint?.id!==ep.id||exact.endpoint.project_id!==t.pid||
        exact.endpoint.branch_id!==t.bid||exact.endpoint.host!==ep.host||
        (!retirement&&exact.endpoint.pooler_enabled!==false)||
        exact.endpoint.current_state!=='active'||
        (retirement?exact.endpoint.type!==ep.type:exact.endpoint.type!=='read_write')||
        exact.endpoint.disabled!==false)
      throw Error('Dependent compute identity or state changed during the inspection');
    const result=await inspectEndpoint(a,c,t,ep,monitorDb,a.monitorRole);
    if(result?.verified!==true||result.role!==a.roleName||
        result.visibility!=='global_role_references_and_complete_compute_sessions'||
        typeof result.clear!=='boolean'||
        !result.totals||['objectReferences','databaseOwnerships',
          'roleMemberships','activeSessions'].some(k=>
          !Number.isSafeInteger(result.totals[k])||result.totals[k]<0))
      throw Error('Complete role ownership and active sessions were not verified');
        if(retirement&&(!Number.isSafeInteger(result.roleOid)||result.roleOid<1||
      !Array.isArray(result.memberships)||result.memberships.length!==result.totals.roleMemberships))
      throw Error('Retirement requires exact role OID and complete named memberships');
    findings.push({endpointId:ep.id,host:ep.host,type:ep.type,
      clear:result.clear,totals:result.totals,
      ...(retirement?{roleOid:result.roleOid,memberships:result.memberships}: {})});
  }
  const total={objectReferences:0,databaseOwnerships:0,roleMemberships:0,
    activeSessions:0};
  for(const finding of findings)
    for(const k of Object.keys(total)){
      total[k]+=finding.totals[k];
      if(!Number.isSafeInteger(total[k]))throw Error('Role dependency counters overflowed');
    }
  // The deprecated pooler_enabled flag does not prove absence of idle
  // PgBouncer clients; PostgreSQL pg_stat_activity cannot see them all.
  // Do not claim deletion safe before independent pooled-client evidence.
  return {verified:true,projectId:t.pid,branchId:t.bid,roleName:a.roleName,
    monitorDatabase:a.monitorDatabase,monitorRole:a.monitorRole,roleRevision:t.role.updated_at??null,
    computeIds:findings.map(f=>f.endpointId),computes:findings,
    totals:total,postgresDependenciesClear:findings.length===active.length &&
      findings.every(f=>f.clear===true)&&Object.values(total).every(x=>x===0),
    poolerClientsVerified:false,clear:false,
    blocker:'Pooled-client absence cannot be independently verified'};
}
