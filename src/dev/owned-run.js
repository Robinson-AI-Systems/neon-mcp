// V-1 run ownership and dev-only target proof shared by V-2 and V-3.
import {classifyTarget} from '../neon/production.js';
const RUN=/^[a-z0-9-]{4,64}$/;
export async function ownedDevTarget(a,c,verifyTarget,{requireAppFree=false}={}){
 if(c?.connection?.profile!=='full'||!RUN.test(a.runId||'')||
    typeof c.db?.getDevRun!=='function'||
    typeof c.db?.listDevRunObjects!=='function'||
    typeof c.getBranch!=='function')
  throw Error('Full owner and recorded developer run required');
 const v=await verifyTarget(a,c);
 if(v.pid!==a.projectId||v.bid!==a.branchId||
    v.endpointId!==a.endpointId||v.database!==a.databaseName||
    v.role!==a.roleName||typeof v.endpoint?.host!=='string')
  throw Error('Exact project, branch and direct PostgreSQL identity unavailable');
 const orgId=c.connection.neonOrg;
 const owned=await c.db.getDevRun({orgId,projectId:v.pid,runId:a.runId});
 const objects=await c.db.listDevRunObjects({
  orgId,projectId:v.pid,runId:a.runId});
 if(owned?.id!==a.runId||owned.status!=='active'||
    !Array.isArray(objects)||objects.length<1||objects.length>100||
    objects.some(x=>x.run_id!==a.runId)||
    objects.filter(x=>x.object_type==='branch'&&x.object_id===v.bid&&x.cleaned!==true).length!==1)
  throw Error('Exact active recorded run branch not owned by this connection scope');
 const branch=await c.getBranch({projectId:v.pid,branchId:v.bid});
 const recorded=objects.find(x=>x.object_type==='branch'&&x.object_id===v.bid);
 const expiry=Date.parse(branch?.expires_at||''),recordedExpiry=Date.parse(recorded?.expires_at||'');
 if(branch?.id!==v.bid||branch.project_id!==v.pid||
    branch.default===true||branch.protected===true||
    !Number.isFinite(expiry)||expiry<Date.now()+300000||
    expiry!==recordedExpiry)
  throw Error('Selected owned development branch is not safely expiring');
 const target={projectId:v.pid,branchId:v.bid,endpointId:v.endpointId,
  expectedEndpointHost:v.endpoint.host,database:v.database,role:v.role,pooled:false};
 const cls=await classifyTarget(c,target);
 if(cls.allowed!==true||cls.production===true)
  throw Error('Synthetic seeding strictly refuses production or shared branches');
 if(requireAppFree&&await c.guards?.checkApp?.({
  projectId:v.pid,branchId:v.bid,target:'branch:'+v.bid
 },c,{...a,outsideApp:false})!==true)
  throw Error('Application-owned developer target refused');
 return {target,expiry};
}
