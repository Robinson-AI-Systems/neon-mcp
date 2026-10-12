// In-memory Neon SQL connection boundary. Future SQL guards (Batch B) own statement authorization.
import { Pool } from '@neondatabase/serverless';
import { createDb } from '../db.js';
import { createKeyVault } from './keys.js';
import { makeNeonClient,call } from './client.js';
import { makeNeonBudget } from './budget.js';

const defaultPoolFactory=(config)=>new Pool(config);
const normalizeHost=host=>host.toLowerCase().replace(/-pooler(?=\.)/,'');
function hostOf(raw) {
  const parsed=new URL(raw);
  if(!['postgres:','postgresql:'].includes(parsed.protocol) || !parsed.hostname)
    throw new Error('Invalid SQL URI');
  return normalizeHost(parsed.hostname);
}
function scrub(result,uri) {
  if(typeof result==='string')return result.split(uri).join('[redacted connection]');
  if(Array.isArray(result))return result.map(value=>scrub(value,uri));
  if(result && typeof result==='object'){
    if(result instanceof Date || result instanceof Uint8Array)return result;
    return Object.fromEntries(Object.entries(result).map(([k,value])=>[k,scrub(value,uri)]));
  }
  return result;
}
export function createSqlLayer({db,vault,env=process.env,fetch,poolFactory=defaultPoolFactory}={}) {
  if(!db?.consumeApiBudget||typeof vault?.keyFor!=='function'||
    typeof poolFactory!=='function')throw new TypeError('SQL layer requires scoped vault, budget and pool');
  return async function withScopedSql(ctx,{projectId,branchId,database,role,pooled=false,endpointId,expectedEndpointHost}={},fn) {
    if(!ctx?.neonOrg||!projectId||!branchId||!database||!role||typeof fn!=='function')
      throw new TypeError('SQL needs organization, project, branch, database, role and callback');
    if(ctx.projectScope && ctx.projectScope!==projectId)
      throw new Error('The requested project is outside this connection’s scope');
    // A15: refuse this server's DB, including the -pooler alias, even on a preview.
    if(!env.DATABASE_URL)throw new Error('This server database URL is not configured');
    const selfHost=hostOf(env.DATABASE_URL);
    const selection=await vault.keyFor({orgId:ctx.neonOrg,projectId,need:'project'});
    if(!selection?.key)throw new Error('A project-scoped Neon key is required to connect');
    let pool,connection,uri;
    try{
      const client=makeNeonClient({key:selection.key,orgId:ctx.neonOrg,
        budget:makeNeonBudget({db,apiKey:selection.key}),fetch});
      const parameters={path:{project_id:projectId},query:{
        branch_id:branchId,database_name:database,role_name:role,pooled,
        ...(endpointId?{endpoint_id:endpointId}:{})
      }};
      // The official SDK 7.0.1 export is getConnectionUri (normalized from OpenAPI getConnectionURI).
      const response=await call(client,'getConnectionUri',parameters);
      if(response.error||typeof response.data?.uri!=='string')
        throw new Error('Connection URI is unavailable');
      uri=response.data.uri;
      const targetHost=hostOf(uri);
      if(targetHost===selfHost)throw new Error('Refusing this server’s own database');
      if(expectedEndpointHost!==undefined){
        const selected=new URL(uri);
        if(typeof expectedEndpointHost!=='string'||
           new URL(uri).hostname.toLowerCase()!==expectedEndpointHost.toLowerCase()||
           decodeURIComponent(selected.pathname.slice(1))!==database||
           decodeURIComponent(selected.username)!==role)
          throw Error('Connection URI does not match the verified endpoint, database and role');
      }
      pool=await poolFactory({connectionString:uri,max:1,connectionTimeoutMillis:5000});
      connection=await pool.connect();
      // Bound all queries even before the dedicated SQL guard exists.
      await connection.query('SET statement_timeout = 15000');
      await connection.query('SET lock_timeout = 5000');
      const safeClient=Object.freeze({query:(text,params=[])=>connection.query(text,params)});
      return scrub(await fn(safeClient),uri);
    }catch{
      // Never echo database URI, role password, internal pool error, or SQL query text.
      throw new Error('Unable to connect to the requested Neon database. Check scope and setup.');
    }finally{
      // Cleanup failures must never leak URI-bearing driver errors.
      try {if(connection)connection.release();}catch{}
      try {if(pool)await pool.end();}catch{}
    }
  };
}
export async function withSqlClient(ctx,options,fn) {
  const db=createDb();
  await db.initSchema();
  const vault=createKeyVault({db});
  return createSqlLayer({db,vault})(ctx,options,fn);
}
