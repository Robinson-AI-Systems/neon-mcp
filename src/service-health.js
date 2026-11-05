// Public health is credential-free and fails closed when the DB cannot be proved reachable.
// Probes are separately enabled to avoid unapproved idle-database activation.
import {registry} from './tools/index.js';
import {publicOrigin} from './core/http.js';
import {serverRelease} from './core/server-release.js';
import {storeSql} from './db-transport.js';
export async function serviceHealth({env=process.env,probe,now=()=>new Date()}={}){
  const release=serverRelease(env);
  let healthy=false;
  try {
    publicOrigin(env);
    if(typeof probe==='function')healthy=await probe()===true;
    else if(env.HEALTH_DB_PROBE_ENABLED==='1' && env.DATABASE_URL){
      // The probe runs through the same own-store transport as the db
      // layer (src/db-transport.js): the Neon HTTP driver on Vercel,
      // pooled pg against the plain-Postgres store on the rack.
      const rows=await storeSql(env).query('SELECT 1 AS probe_ok',[]);
      healthy=rows?.[0]?.probe_ok===1;
    }
  }catch{/* Never reveal database or OAuth configuration details to a public caller. */}
  return Object.freeze({
    status:healthy?'ok':'degraded',
    version:release.version,
    revision:release.commit,
    tools:registry.tools.length,
    timestamp:now().toISOString()
  });
}
