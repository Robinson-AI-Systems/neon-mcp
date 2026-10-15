// V-3 run-owned developer checkpoints, reset and exact-LSN restoration.
// The ordinary branch restore tool supplies the full B-1/B-4 destructive/spend gates.
import {createHash} from 'node:crypto';
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {verifyConnectionTarget} from './connections.js';
import {ownedDevTarget} from '../dev/owned-run.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';
import {runAuthorizedSqlRead} from '../neon/sql-read.js';
import {createBranchRestoreHandlers} from './branch-restores.js';
import {projectRead} from './project-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const db={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const run={type:'string',pattern:'^[a-z0-9-]{4,64}$'};
const cpName={type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{2,64}$'};
const LSN=/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/i;
const base={projectId:id,branchId:id,runId:run,endpointId:id,
 databaseName:db,roleName:db,dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}};
const schema=(more)=>({type:'object',additionalProperties:false,
 properties:{...base,...more},
 required:['projectId','branchId','runId','endpointId','databaseName','roleName']});
const hash=x=>createHash('sha256').update(x).digest('hex');
const keyFor=(c,a)=>[c.connection.neonOrg,a.projectId,a.branchId,a.runId,a.name].join('|');
const checkName=n=>typeof n==='string'&&/^[A-Za-z][A-Za-z0-9_-]{2,64}$/.test(n);
const parse=m=>JSON.parse(m.content[0].text);

async function sameOwned(a,c,verifyTarget){
 return ownedDevTarget(a,c,verifyTarget,{requireAppFree:true});
}
async function singleBranchInventory(c,projectId,branchId,{allowChildren=false}={}){
 const client=await c.clientFor(projectId);
 const data=await projectRead(client,'listProjectBranches',
  {path:{project_id:projectId},query:{limit:100}});
 if(!Array.isArray(data?.branches)||data.branches.length>100||
    data.pagination?.cursor||data.pagination?.next||
    data.branches.some(x=>x.project_id!==projectId)||
    new Set(data.branches.map(x=>x.id)).size!==data.branches.length||
    !data.branches.some(x=>x.id===branchId))
  throw Error('Complete Neon development branch inventory required');
 if(!allowChildren&&data.branches.some(x=>x.parent_id===branchId))
  throw Error('Developer restore refuses branches with children or foreign resources');
 return {client,branches:data.branches};
}
async function retention(c,a,row,client){
 if(!row||!LSN.test(row.lsn||'')||!Number.isFinite(Date.parse(row.created_at)))
  throw Error('A current named and recorded WAL checkpoint is required');
 const data=await projectRead(client,'getProject',{path:{project_id:a.projectId}});
 const seconds=data?.project?.history_retention_seconds;
 if(data?.project?.id!==a.projectId||
    data.project.org_id!==c.connection.neonOrg||
    !Number.isSafeInteger(seconds)||seconds<60||seconds>2592000)
  throw Error('Cannot verify project point-in-time history retention');
 const age=Date.now()-Date.parse(row.created_at);
 if(age<0||age>=seconds*1000-60000)
  throw Error('Checkpoint is outside the verified restore history window');
 return seconds;
}
async function backupExpiry(c,a,before,mutationKey){
 const {client,branches}=await singleBranchInventory(c,a.projectId,a.branchId,{allowChildren:true});
 const matches=branches.filter(x=>x.name===before.preserveName);
 if(matches.length!==1||matches[0].id===a.branchId||
    matches[0].project_id!==a.projectId||matches[0].default===true||
    matches[0].protected===true) return false;
 const backup=matches[0],desired=new Date(before.expiry).toISOString();
 const orgId=c.connection.neonOrg;
 // Record the observed branch even if the provider refuses to set the TTL:
 // it must remain discoverable for exact owner-run cleanup/recovery, never
 // be silently lost due to a post-restore HTTP error.
 if(await c.db.recordDevRunBranch?.({orgId,projectId:a.projectId,
  runId:a.runId,branchId:backup.id,parentId:backup.parent_id,expiresAt:desired})!==true){
  const objects=await c.db.listDevRunObjects?.({orgId,projectId:a.projectId,runId:a.runId});
  if(!objects?.some(x=>x.object_type==='branch'&&x.object_id===backup.id&&
     x.cleaned===false))return false;
 }
 let after=await projectRead(client,'getProjectBranch',
  {path:{project_id:a.projectId,branch_id:backup.id}});
 if(after?.branch?.expires_at!==desired){
  const changed=await applyNeonWrite({
   client,projectId:a.projectId,operationId:'updateProjectBranch',
   params:{path:{project_id:a.projectId,branch_id:backup.id},
    body:{branch:{expires_at:desired}}},
   requestKey:'rmcp_v3_expiry_'+hash(mutationKey).slice(0,40)});
  if(changed.confirmed!==true)return false;
  after=await projectRead(client,'getProjectBranch',
   {path:{project_id:a.projectId,branch_id:backup.id}});
 }
 return after?.branch?.id===backup.id&&after.branch.project_id===a.projectId&&
   after.branch.default!==true&&after.branch.protected!==true&&
   after.branch.expires_at===desired;
}
export function createDevCheckpointHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env}),
 readWal=null,delegate=null,postRestore=backupExpiry,
 inventoryFor=singleBranchInventory,checkRetention=retention
}={}){
 const delegated=delegate??createBranchRestoreHandlers({contextFor:async c=>c});
 const checkpoint=defineWrite({name:'neon_dev_checkpoint',productionEffect:'none',
  plan:async(a,c)=>{
   if(!checkName(a.name))throw Error('Named developer checkpoint required');
   const state=await sameOwned(a,c,verifyTarget);
   return {projectId:a.projectId,branchId:a.branchId,
    target:'dev-checkpoint:'+a.projectId+'/'+a.branchId+'/'+a.name,
    before:state,summary:'Record a named WAL checkpoint for active run '+
     a.runId+' on expiring nonproduction branch '+a.branchId+
     '. Read-only SQL captures the point; no branch or data is modified.'};
  },
  apply:async(a,c,{before,requestKey})=>{
   if(!checkName(a.name))throw Error('Named developer checkpoint required');
   const state=await sameOwned(a,c,verifyTarget);
   if(JSON.stringify(state)!==JSON.stringify(before))
    throw Error('The recorded development run or target has changed');
   let wal;
   if(readWal)wal=await readWal({args:a,ctx:c,target:state.target});
   else{
    const result=await runAuthorizedSqlRead({ctx:c,target:state.target,
     text:'SELECT pg_current_wal_lsn()::text AS wal_lsn',params:[],
     sqlLayer:sqlFactory(c)});
    if(result?.done!==true||result.truncated===true||result.rows?.length!==1)
     return {confirmed:'pending'};
    wal=result.rows[0]?.wal_lsn;
   }
   if(!LSN.test(wal||''))return {confirmed:'pending'};
   const id='cp_'+hash(keyFor(c,a)).slice(0,40);
   const saved=await c.db.saveDevCheckpoint?.({
    id,orgId:c.connection.neonOrg,projectId:a.projectId,
    branchId:a.branchId,runId:a.runId,name:a.name,lsn:wal});
   if(saved?.id!==id||saved.lsn!==wal)return {confirmed:'pending'};
   c.currentDevCheckpoint={id,name:a.name,lsn:wal,requestKey};
   return {confirmed:true};
  },
  readAfter:async(a,c)=>c.db.getDevCheckpoint?.({
   orgId:c.connection.neonOrg,projectId:a.projectId,
   branchId:a.branchId,runId:a.runId,name:a.name}),
  verify:async(_before,after,a,c)=>after?.id===c.currentDevCheckpoint?.id&&
   after?.lsn===c.currentDevCheckpoint?.lsn&&after?.name===a.name
 });
 function restoreDefinition(kind){
  return defineWrite({name:kind==='reset'?'neon_dev_reset_branch':
   'neon_dev_restore_checkpoint',productionEffect:'none',
   destructive:true,
   plan:async(a,c)=>{
    const state=await sameOwned(a,c,verifyTarget);
    if(kind==='checkpoint'&&!checkName(a.checkpointName))
     throw Error('Choose an existing named run checkpoint');
    const inventory=await inventoryFor(c,a.projectId,a.branchId);
    const requestKey=c.writeKey(kind==='reset'?'neon_dev_reset_branch':
     'neon_dev_restore_checkpoint',a);
    const preserveName='dev-preserve-'+hash(requestKey).slice(0,24);
    if(inventory.branches.some(x=>x.name===preserveName))
     throw Error('A preserved restore branch with this identity already exists');
    let checkpointRecord=null,retentionSeconds=null;
    if(kind==='checkpoint'){
     checkpointRecord=await c.db.getDevCheckpoint?.({
      orgId:c.connection.neonOrg,projectId:a.projectId,branchId:a.branchId,
      runId:a.runId,name:a.checkpointName});
     retentionSeconds=await checkRetention(c,a,checkpointRecord,inventory.client);
    }else{
     const branch=await c.getBranch({projectId:a.projectId,branchId:a.branchId});
     if(typeof branch?.parent_id!=='string'||!inventory.branches.some(
      x=>x.id===branch.parent_id))
      throw Error('Development branch no longer has a verified parent');
    }
    return {projectId:a.projectId,branchId:a.branchId,
     target:'dev-'+kind+':'+a.projectId+'/'+a.branchId,
     before:{...state,preserveName,checkpointRecord,
      retentionSeconds,requestKey},
     summary:(kind==='reset'?'Reset the owned branch from its verified parent':
       'Restore the owned branch to named checkpoint '+a.checkpointName)+
      '; never change production. Neon creates a preservation branch and'+
      ' can restart compute; owner price confirmation and recorded expiring'+
      ' cleanup are required, otherwise the attempt remains pending.'};
   },
   apply:async(a,c,{before,requestKey})=>{
    const current=await sameOwned(a,c,verifyTarget);
    if(JSON.stringify(current)!==JSON.stringify({target:before.target,expiry:before.expiry})||
       requestKey!==before.requestKey)
     throw Error('Run, branch or request identity drifted after preview');
    const inventory=await inventoryFor(c,a.projectId,a.branchId);
    if(inventory.branches.some(x=>x.name===before.preserveName))
     throw Error('A previous restore may already have created its preservation branch');
    if(kind==='checkpoint'){
     const cp=await c.db.getDevCheckpoint?.({
      orgId:c.connection.neonOrg,projectId:a.projectId,branchId:a.branchId,
      runId:a.runId,name:a.checkpointName});
     if(JSON.stringify(cp)!==JSON.stringify(before.checkpointRecord))
      throw Error('Recorded checkpoint changed before owner approval');
     const history=await checkRetention(c,a,cp,inventory.client);
     if(history!==before.retentionSeconds)
      throw Error('Restore history policy changed before apply');
    }
    const mapped={projectId:a.projectId,branchId:a.branchId,
     preserveName:before.preserveName,
     requestKey:'v3-'+hash(requestKey).slice(0,36),confirm:true};
    if(kind==='checkpoint'){
     mapped.sourceBranchId=a.branchId;
     mapped.sourceLsn=before.checkpointRecord.lsn;
    }
    const name=kind==='reset'?'neon_branch_reset_from_parent':'neon_branch_restore';
    const result=parse(await delegated[name](mapped,c));
    if(result?.done!==true||result.confirmed!==true)
     return {confirmed:result?.confirmed==='pending'?'pending':false};
    const recovered=await postRestore(c,a,before,requestKey);
    if(recovered!==true)return {confirmed:'pending'};
    c.devRestored={confirmed:true,name:before.preserveName};
    return {confirmed:true};
   },
   readAfter:async(_a,c)=>c.devRestored??null,
   verify:async(before,after)=>after?.confirmed===true&&
    after.name===before.preserveName
  });
 }
 const reset=restoreDefinition('reset'),restore=restoreDefinition('checkpoint');
 const defs=[
  [checkpoint,schema({name:cpName}),'Capture a named read-only WAL checkpoint on an owned dev run.'],
  [reset,schema({}),'Reset only the expiring run-owned dev branch, preserving old state and applying B-4 spending gates.'],
  [restore,schema({checkpointName:cpName}),'Restore only the owned dev branch to its named, retained WAL checkpoint with preservation and spending gates.']
 ];
 return {tools:defs.map(([def,inputSchema,description])=>({
  ...def.tool,inputSchema,description,area:'developer',
  audience:['owner','builder'],profiles:['full']})),
  handlers:Object.fromEntries(defs.map(([def])=>[def.tool.name,
   async(a,raw)=>def.handler(a,await contextFor(raw))]))};
}
const built=createDevCheckpointHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
