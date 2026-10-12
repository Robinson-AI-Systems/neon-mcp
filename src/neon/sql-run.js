// B-3: private, fixed-statement SQL runner for D-4 role privileges/dependencies.
// No caller-supplied SQL; production privileged role DDL awaits D-5 preview/LSN.
import {classifySql} from './sql-guard.js';
import {classifyTarget} from './production.js';
import {checkProtectedTarget} from '../core/protected-resources.js';
import {createSqlLayer} from './sql.js';
import {createKeyVault} from './keys.js';
import {grantReadOnlyPrivileges} from './role-privileges.js';
import {inspectRoleDeletionDependencies} from './role-dependencies.js';

const id=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const ident='"[A-Za-z_][A-Za-z0-9_]{0,62}"';
const usage=new RegExp('^GRANT USAGE ON SCHEMA '+ident+' TO '+ident+'$');
const select=new RegExp('^GRANT SELECT ON ALL TABLES IN SCHEMA '+ident+' TO '+ident+'$');
const defaults=new RegExp('^ALTER DEFAULT PRIVILEGES FOR ROLE '+ident+
  ' IN SCHEMA '+ident+' GRANT SELECT ON TABLES TO '+ident+'$');
const controls=new Set(['BEGIN','BEGIN READ ONLY','COMMIT','ROLLBACK',
 'SET LOCAL statement_timeout = 15000','SET LOCAL lock_timeout = 5000']);

export async function runFixedReviewedSql(query,text,params=[],{readOnly=false}={}){
 if(typeof query!=='function'||typeof text!=='string'||
    !Array.isArray(params)||params.length>100)
  throw Error('Internal SQL runner requires a fixed reviewed statement');
 if(controls.has(text)){
  if(readOnly&&text==='BEGIN')throw Error('Dependency probe requires BEGIN READ ONLY');
  return query(text,params);
 }
 const classified=await classifySql(text);
 if(text.startsWith('SELECT ')&&classified.kind==='read')
  return query(text,params);
 if(!readOnly&&(usage.test(text)||select.test(text))&&
    classified.kind==='ddl'&&classified.access===true)
  return query(text,params);
 // Generic B-3 intentionally treats ALTER DEFAULT PRIVILEGES conservatively:
 // only this exact internal owner-specific SELECT grant is permitted here.
 if(!readOnly&&defaults.test(text)&&classified.kind!=='refused')
  return query(text,params);
 throw Error('Unreviewed or unclassified SQL cannot reach a privileged connection');
}

export async function assertRoleSqlAdmission({ctx,target,args,purpose='grant'}={}){
 if(!['grant','probe'].includes(purpose))throw Error('Unknown reviewed role SQL purpose');
 const pid=target?.pid??target?.projectId,bid=target?.bid??target?.branchId;
 const conn=ctx?.connection,scope=conn?.projectScope??conn?.project_scope;
 if(!id(pid)||!id(bid)||scope&&scope!==pid||
    conn?.profile!=='full'||!['preview','production'].includes(conn?.mode)||
    typeof ctx?.db?.getSqlReadPolicy!=='function')
  throw Error('Scoped owner and persisted SQL policy required');
 const intended={projectId:pid,branchId:bid,target:'branch:'+bid};
 if(await checkProtectedTarget(intended,ctx)!==true)
  throw Error('Protected resource cannot be inspected or granted');
 const cls=await classifyTarget(ctx,intended);
 if(cls.allowed!==true)throw Error('PostgreSQL branch classification unverified');
 // No D-4 DDL in production without D-5's exact SQL preview and restore LSN.
 if(cls.production&&purpose==='grant')
  throw Error('Production privileged role SQL is gated until D-5');
 if(cls.production&&(conn.mode!=='production'||ctx.deploymentEnv!=='production'))
  throw Error('Production monitoring requires an approved production deployment');
 if(await ctx.guards?.checkApp?.(intended,ctx,args)!==true)
  throw Error('An application owns this resource');
 const access=await ctx.guards?.checkProduction?.(intended,ctx,{
  name:purpose==='probe'?'neon_role_delete':'neon_role_create_read_only',
  productionEffect:'write'});
 if(access?.allowed!==true||access.production!==cls.production)
  throw Error('Owner write/production admission unavailable');
 const policy=await ctx.db.getSqlReadPolicy();
 if(typeof policy?.productionReads!=='boolean'||
    !Number.isSafeInteger(policy.maxRows)||policy.maxRows<1||policy.maxRows>200)
  throw Error('Stored SQL safety settings are not verified');
 if(cls.production&&policy.productionReads!==true)
  throw Error('Production SQL monitoring reads are disabled by owner settings');
 return true;
}
async function runRoleSql(a,c,t,fn,{purpose='grant'}={}){
 await assertRoleSqlAdmission({ctx:c,target:t,args:a,purpose});
 const layer=createSqlLayer({db:c.db,vault:createKeyVault({
  db:c.db,env:c.env}),env:c.env});
 return layer({neonOrg:c.connection.neonOrg,
  projectScope:c.connection.projectScope??null},{
  projectId:t.pid,branchId:t.bid,endpointId:a.endpointId??t.endpointId,
  expectedEndpointHost:t.endpointHost??t.host,
  database:a.databaseName??t.databaseName,
  role:a.ownerName??t.monitorRole,pooled:false
 },client=>fn((statement,params=[])=>runFixedReviewedSql(client.query,statement,params,
  {readOnly:purpose==='probe'})));
}
export async function runGuardedRoleGrants(a,c,t){
 return runRoleSql(a,c,t,query=>grantReadOnlyPrivileges(query,{
  reader:a.name,owner:a.ownerName,schemas:a.schemas}));
}
export async function runGuardedRoleDependencyProbe(a,c,t,ep,db,monitor){
 return runRoleSql({...a,endpointId:ep.id,databaseName:db.name,
   ownerName:monitor},c,{...t,endpointHost:ep.host},
  query=>inspectRoleDeletionDependencies(query,a.roleName),{purpose:'probe'});
}
