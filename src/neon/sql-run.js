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


// D-5 public SQL entry point: the sole reviewed bridge for caller-supplied SQL.
// PostgreSQL enforces LIMIT before the driver materializes rows; the B-3 AST,
// protected-resource and owner-stored read policies remain mandatory.
import {parse} from 'libpg-query';
import {quoteIdent} from './sql-ident.js';
import {runAuthorizedSqlRead} from './sql-read.js';

const MAX_PUBLIC_ROWS=201;
const MAX_PUBLIC_COLUMNS=16;
const MAX_PUBLIC_CELL=128;
function compactCell(value){
 if(value===null || typeof value==='boolean' ||
    typeof value==='number'&&Number.isFinite(value))return value;
 let result;
 try{result=typeof value==='string'?value:JSON.stringify(value);}
 catch{return '[unavailable]';}
 if(typeof result!=='string')return '[unavailable]';
 return result.length>MAX_PUBLIC_CELL?result.slice(0,MAX_PUBLIC_CELL)+'…':result;
}
function compactPublicResult(result){
 if(result?.done!==true||!Array.isArray(result.rows))return result;
 let truncatedCells=false,truncatedColumns=false;
 const rows=result.rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))return {};
  const entries=Object.entries(row);
  if(entries.length>MAX_PUBLIC_COLUMNS)truncatedColumns=true;
  return Object.fromEntries(entries.slice(0,MAX_PUBLIC_COLUMNS).map(([key,value])=>{
   const compact=compactCell(value);
   if(typeof value==='string'&&compact!==value ||
      value!==null&&typeof value==='object')truncatedCells=true;
   return [key.slice(0,63),compact];
  }));
 });
 return {...result,rows,columnsCapped:truncatedColumns,cellsCapped:truncatedCells};
}
export async function runPublicSqlQuery({ctx,target,text,params=[],sqlLayer}={}){
 // Other SQL statement types have separate reviewed tools; no SHOW or EXPLAIN
 // can be wrapped here. The AST guard still runs again inside B-3.
 let parsed;
 try{parsed=await parse(text);}catch{return {done:false,code:'not_read_only',
  message:'Provide one valid SELECT query.'};}
 if(!Array.isArray(parsed?.stmts)||parsed.stmts.length!==1||
    !parsed.stmts[0]?.stmt?.SelectStmt)
  return {done:false,code:'not_read_only',message:'Use one SELECT query.'};
 const statement=text.trim().replace(/;\s*$/,'');
 const layer=sqlLayer??createSqlLayer({db:ctx?.db,
  vault:createKeyVault({db:ctx?.db,env:ctx?.env}),env:ctx?.env});
 const boundedLayer=(scope,options,callback)=>layer(scope,options,client=>
  callback({query:(query,values=[])=>{
   if(query!==text)return client.query(query,values);
   // Original query is independently proven to contain exactly one SELECT.
   const limited='SELECT * FROM ('+statement+') AS rmcp_bounded_query LIMIT $'+(values.length+1);
   return client.query(limited,[...values,MAX_PUBLIC_ROWS]);
  }}));
 return compactPublicResult(await runAuthorizedSqlRead({ctx,target,text,params,sqlLayer:boundedLayer}));
}


export async function runPublicSqlExplain({ctx,target,text,params=[],analyze=false,sqlLayer}={}){
 if(typeof text!=='string'||text.length>20000||typeof analyze!=='boolean')
  return {done:false,code:'not_read_only',message:'One supported SQL statement is required.'};
 let ast;
 try{ast=await parse(text);}catch{
  return {done:false,code:'not_read_only',message:'Provide one valid SQL statement.'};
 }
 if(ast?.stmts?.length!==1)
  return {done:false,code:'not_read_only',message:'Provide exactly one SQL statement.'};
 const root=ast.stmts[0]?.stmt;
 const isRead=Boolean(root?.SelectStmt);
 const isDml=Boolean(root?.InsertStmt||root?.UpdateStmt||root?.DeleteStmt||root?.MergeStmt);
 if(!isRead&&!isDml)
  return {done:false,code:'not_read_only',message:'Only SELECT and non-executing DML plans are supported.'};
 const selected=await classifySql(text);
 if(selected.kind==='refused'||selected.unknownNode===true||
    isRead&&selected.kind!=='read'||
    isDml&&!['write','destructive'].includes(selected.kind))
  return {done:false,code:'not_read_only',message:'The SQL statement cannot be planned safely.'};
 if(isDml&&analyze)
  return {done:false,code:'analyze_write_refused',
   message:'ANALYZE can execute writes. Use a plain EXPLAIN or isolated change preview.'};
 // Root statement and AST safety have been checked before the constant prefix.
 // PostgreSQL runs it in BEGIN READ ONLY; ANALYZE is always FALSE for DML.
 const plan='EXPLAIN (FORMAT TEXT, ANALYZE '+(isRead&&analyze?'TRUE':'FALSE')+') '+
  text.trim().replace(/;\s*$/,'');
 const layer=sqlLayer??createSqlLayer({db:ctx?.db,
  vault:createKeyVault({db:ctx?.db,env:ctx?.env}),env:ctx?.env});
 const result=await runAuthorizedSqlRead({ctx,target,text:plan,params,
  sqlLayer:layer,nonExecutingDmlPlan:isDml});
 return {...compactPublicResult(result),
  analyzed:result?.done===true?isRead&&analyze:false,
  nonExecutingWritePlan:result?.done===true&&isDml};
}

// D-5: fixed SQL for a single guarded query cancellation. Never terminate a
// backend, expose SQL text, or accept a caller-provided statement or target DB.
const ACTIVE_SESSION_SQL='SELECT pid,datname,usename,backend_type,state,'+
 ' EXTRACT(EPOCH FROM backend_start)::text AS backend_start,EXTRACT(EPOCH FROM query_start)::text AS query_start'+
 ' FROM pg_catalog.pg_stat_activity WHERE pid=$1 AND datname=current_database()'+
 " AND usename=current_user AND backend_type='client backend'"+
 ' AND pid<>pg_backend_pid()';
const SIGNAL_CANCEL_SQL='SELECT pg_cancel_backend(pid) AS cancelled'+
 ' FROM pg_catalog.pg_stat_activity WHERE pid=$1 AND datname=current_database()'+
 " AND usename=current_user AND backend_type='client backend' AND state='active'"+
 ' AND EXTRACT(EPOCH FROM backend_start)::text=$2 AND EXTRACT(EPOCH FROM query_start)::text=$3 AND pid<>pg_backend_pid()';
const validPid=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;
const validSignature=row=>validPid(row?.pid)&&row.state==='active'&&
 typeof row.backend_start==='string'&&row.backend_start.length>0&&
 typeof row.query_start==='string'&&row.query_start.length>0;
const targetOptions=t=>({projectId:t.projectId,branchId:t.branchId,
 database:t.database,role:t.role,endpointId:t.endpointId,
 expectedEndpointHost:t.expectedEndpointHost,pooled:false});
function scopedSql(ctx,sqlLayer){
 if(typeof sqlLayer==='function')return sqlLayer;
 return createSqlLayer({db:ctx.db,
  vault:createKeyVault({db:ctx.db,env:ctx.env}),env:ctx.env});
}
export async function requestScopedQueryCancellation({ctx,target,pid,sqlLayer}={}){
 if(!validPid(pid)||!ctx?.connection?.neonOrg||!target?.projectId||
    !target?.branchId||!target?.database||!target?.role||
    !target?.endpointId||!target?.expectedEndpointHost)
  throw Error('An exact scoped session and direct connection are required');
 const layer=scopedSql(ctx,sqlLayer);
 return layer({neonOrg:ctx.connection.neonOrg,projectScope:ctx.connection.projectScope??null},
  targetOptions(target),async client=>{
   const pre=await client.query(ACTIVE_SESSION_SQL,[pid]);
   if(!Array.isArray(pre?.rows)||pre.rows.length!==1||
      !validSignature(pre.rows[0])||pre.rows[0].pid!==pid)
    return {requested:false};
   const snapshot=pre.rows[0];
   const reply=await client.query(SIGNAL_CANCEL_SQL,
    [pid,snapshot.backend_start,snapshot.query_start]);
   if(!Array.isArray(reply?.rows)||reply.rows.length!==1||
      reply.rows[0]?.cancelled!==true)
    return {requested:false};
   return {requested:true,signature:{
    pid,backendStart:snapshot.backend_start,queryStart:snapshot.query_start}};
  });
}
export async function observeScopedQueryCancellation({
 ctx,target,pid,signature,sqlLayer
}={}){
 if(!validPid(pid)||signature?.pid!==pid||
    typeof signature.backendStart!=='string'||
    typeof signature.queryStart!=='string'||!target?.expectedEndpointHost)
  throw Error('A verified cancellation attempt is required');
 const layer=scopedSql(ctx,sqlLayer);
 return layer({neonOrg:ctx.connection.neonOrg,projectScope:ctx.connection.projectScope??null},
  targetOptions(target),async client=>{
   const found=await client.query(ACTIVE_SESSION_SQL,[pid]);
   if(!Array.isArray(found?.rows)||found.rows.length>1)
    throw Error('Session readback was incomplete');
   const row=found.rows[0];
   return {finished:!row||row.backend_start!==signature.backendStart||
    row.query_start!==signature.queryStart||row.state!=='active'};
  });
}


// D-6 purpose-specific development-only extension DDL. Public SQL execution
// deliberately rejects CreateExtensionStmt / AlterExtensionStmt; this private
// boundary accepts only server-constructed statements from a small vetted set.
const approvedExtensions=new Set(['citext','pg_trgm','unaccent','hstore',
  'btree_gin','btree_gist']);
export const safeExtensionNames=Object.freeze([...approvedExtensions]);
export function buildReviewedExtensionDDL(name,update=false,remove=false){
 if(!approvedExtensions.has(name)||typeof update!=='boolean'||typeof remove!=='boolean'||remove&&update)
  throw Error('Extension is not in the audited low-risk development allowlist');
 if(remove)return 'DROP EXTENSION '+quoteIdent(name)+' RESTRICT';
 return update?'ALTER EXTENSION '+quoteIdent(name)+' UPDATE':
  'CREATE EXTENSION '+quoteIdent(name)+' WITH SCHEMA "public"';
}
export async function runReviewedExtensionMutation({
 ctx,target,name,update=false,remove=false,sqlLayer}={}){
 if(!ctx?.db||!ctx.connection?.neonOrg||!target?.projectId||
  !target?.branchId||!target?.endpointId||!target?.expectedEndpointHost||
  !target?.database||!target?.role||target.pooled!==false)
  throw Error('Verified direct development SQL identity required');
 const statement=buildReviewedExtensionDDL(name,update,remove);
 const parsed=await parse(statement);
 const stmt=parsed?.stmts?.[0]?.stmt;
 if(parsed?.stmts?.length!==1||
  !remove&&!update&&!stmt?.CreateExtensionStmt||
  update&&!stmt?.AlterExtensionStmt||
  remove&&(stmt?.DropStmt?.removeType!=='OBJECT_EXTENSION'||stmt.DropStmt.behavior!=='DROP_RESTRICT'))
  throw Error('Unreviewed extension statement AST');
 const withSql=sqlLayer??createSqlLayer({db:ctx.db,
  vault:createKeyVault({db:ctx.db,env:ctx.env}),env:ctx.env});
 return withSql({neonOrg:ctx.connection.neonOrg,
  projectScope:ctx.connection.projectScope??null},target,async client=>{
  // A driver/network failure during COMMIT is deliberately ambiguous: B-1
  // leaves the durable request pending. It must never automatically replay.
  let began=false,committing=false;
  try{
   await client.query('BEGIN');began=true;
   await client.query('SET LOCAL lock_timeout = 5000');
   await client.query('SET LOCAL statement_timeout = 15000');
   await client.query(statement);
   committing=true;await client.query('COMMIT');began=false;
   return {issued:true};
  }catch{
   if(began&&!committing){try{await client.query('ROLLBACK');}catch{}}
   throw Error('Extension operation is not confirmed; independently inspect before retry');
  }
 });
}

// Purpose-specific concurrent index DDL; never arbitrary caller SQL.
export function buildReviewedIndexDDL({schema,table,index,columns,remove=false}={}){
 if(typeof remove!=='boolean'||typeof schema!=='string'||schema.startsWith('pg_')||
  schema==='information_schema')throw Error('Non-system index scope required');
 const qualified=quoteIdent(schema)+'.'+quoteIdent(index);
 if(remove)return 'DROP INDEX CONCURRENTLY '+qualified+' RESTRICT';
 if(!Array.isArray(columns)||columns.length<1||columns.length>3||
  new Set(columns).size!==columns.length)throw Error('Select distinct index columns');
 return 'CREATE INDEX CONCURRENTLY '+quoteIdent(index)+' ON '+quoteIdent(schema)+'.'+
  quoteIdent(table)+' USING btree ('+columns.map(quoteIdent).join(', ')+')';
}
export async function runReviewedIndexMutation({ctx,target,schema,table,index,
 columns,remove=false,sqlLayer}={}){
 if(!ctx?.db||!ctx.connection?.neonOrg||!target?.projectId||!target.branchId||
  !target.endpointId||!target.expectedEndpointHost||!target.database||
  !target.role||target.pooled!==false)throw Error('Verified direct index target required');
 const statement=buildReviewedIndexDDL({schema,table,index,columns,remove});
 const parsed=await parse(statement),stmt=parsed?.stmts?.[0]?.stmt;
 if(parsed?.stmts?.length!==1||!remove&&!stmt?.IndexStmt?.concurrent||
  remove&&(stmt?.DropStmt?.removeType!=='OBJECT_INDEX'||
   stmt.DropStmt.concurrent!==true||stmt.DropStmt.behavior!=='DROP_RESTRICT'))
  throw Error('Unreviewed index statement');
 const layer=sqlLayer??createSqlLayer({db:ctx.db,
  vault:createKeyVault({db:ctx.db,env:ctx.env}),env:ctx.env});
 return layer({neonOrg:ctx.connection.neonOrg,projectScope:ctx.connection.projectScope??null},target,
  async client=>{
   // CONCURRENTLY cannot run in BEGIN. The scoped layer closes this session,
   // including these bounded settings, on every outcome. Never retry DDL.
   await client.query('SET lock_timeout = 5000');
   await client.query('SET statement_timeout = 15000');
   await client.query(statement);return {issued:true};
  });
}


// D-9: REINDEX only the exact reviewed INDEX or regular TABLE, outside BEGIN.
export function buildReviewedReindexDDL({schema,table,index,scope='index'}={}){
 if(!['index','table'].includes(scope)||typeof schema!=='string'||
    schema.startsWith('pg_')||schema==='information_schema')
  throw Error('Reviewed non-system reindex scope required');
 const name=scope==='index'?index:table;
 return 'REINDEX '+(scope==='index'?'INDEX':'TABLE')+' CONCURRENTLY '+
  quoteIdent(schema)+'.'+quoteIdent(name);
}
export async function runReviewedReindexMutation({ctx,target,schema,table,index,
 scope='index',sqlLayer}={}){
 if(!ctx?.db||!ctx.connection?.neonOrg||!target?.projectId||!target.branchId||
    !target.endpointId||!target.expectedEndpointHost||!target.database||
    !target.role||target.pooled!==false)
  throw Error('Verified direct reindex target required');
 const timeout=await ctx.db.getSqlMaintenanceTimeoutMs?.();
 if(!Number.isSafeInteger(timeout)||timeout<15000||timeout>3600000)
  throw Error('Verified stored maintenance timeout is unavailable');
 const statement=buildReviewedReindexDDL({schema,table,index,scope});
 const ast=await parse(statement);
 if(ast?.stmts?.length!==1||!ast.stmts[0]?.stmt?.ReindexStmt)
  throw Error('Unreviewed reindex statement');
 const layer=sqlLayer??createSqlLayer({db:ctx.db,
  vault:createKeyVault({db:ctx.db,env:ctx.env}),env:ctx.env});
 return layer({neonOrg:ctx.connection.neonOrg,projectScope:ctx.connection.projectScope??null},
  target,async client=>{
   // Concurrent reindex must not run inside a transaction; a network error
   // is ambiguous, so B-1 leaves the request pending rather than replaying.
   await client.query('SET lock_timeout = 5000');
   await client.query('SET statement_timeout = '+timeout);
   await client.query(statement);
   return {issued:true};
  });
}


// D-6 development-only VACUUM (ANALYZE): no transaction, no automatic replay.
export function buildReviewedVacuumDDL({schema,table}={}){
 if(typeof schema!=='string'||schema.startsWith('pg_')||
    schema==='information_schema'||
    !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(schema)||
    !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(table))
  throw Error('Exact non-system regular-table identifier required');
 return 'VACUUM (ANALYZE) '+quoteIdent(schema)+'.'+quoteIdent(table);
}
export async function runReviewedVacuumMutation({ctx,target,schema,table,sqlLayer}={}){
 if(!ctx?.db||!ctx.connection?.neonOrg||!target?.projectId||!target.branchId||
    !target.endpointId||!target.expectedEndpointHost||!target.database||
    !target.role||target.pooled!==false)
  throw Error('Exact direct development VACUUM target required');
 const timeout=await ctx.db.getSqlMaintenanceTimeoutMs?.();
 if(!Number.isSafeInteger(timeout)||timeout<15000||timeout>3600000)
  throw Error('Stored maintenance timeout unavailable');
 const statement=buildReviewedVacuumDDL({schema,table});
 const ast=await parse(statement);
 if(ast?.stmts?.length!==1||!ast.stmts[0]?.stmt?.VacuumStmt)
  throw Error('Unreviewed vacuum statement');
 const layer=sqlLayer??createSqlLayer({db:ctx.db,
  vault:createKeyVault({db:ctx.db,env:ctx.env}),env:ctx.env});
 return layer({neonOrg:ctx.connection.neonOrg,projectScope:ctx.connection.projectScope??null},
  target,async client=>{
   await client.query('SET lock_timeout = 5000');
   await client.query('SET statement_timeout = '+timeout);
   await client.query(statement);
   return {issued:true};
  });
}
