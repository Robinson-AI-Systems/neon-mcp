// V-2: owner-confirmed deterministic seed into an already owned, expiring dev branch.
// Service-owned SQL only: no caller SQL, arbitrary tables, production or auto retries.
import {createHash} from 'node:crypto';
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {verifyConnectionTarget} from './connections.js';
import {classifyTarget} from '../neon/production.js';
import {classifySql} from '../neon/sql-guard.js';
import {createSqlAdmissions} from '../neon/sql-admission.js';
import {applyGuardedSql} from '../neon/sql-apply.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';
import {compileDemoSeed,verifyDemoSeed} from '../dev/seed-plan.js';
import {fetchPublicSource} from '../dev/public-source.js';
import {compilePublicImport,verifyPublicImport} from '../dev/import-plan.js';
import {chooseDemoScenario} from '../dev/scenario-choice.js';
import {compileAutoSeed,verifyAutoSeed} from '../dev/auto-plan.js';
import {runAuthorizedSqlRead} from '../neon/sql-read.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const run={type:'string',pattern:'^[a-z0-9-]{4,64}$'};
const name={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const RUN=/^[a-z0-9-]{4,64}$/;
const schema={
 type:'object',additionalProperties:false,
 properties:{projectId:id,branchId:id,runId:run,endpointId:id,
  databaseName:name,roleName:name,
  scenario:{type:'string',enum:['saas','store','rental','blog','auto']},
   existingSchema:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,62}$'},
  description:{type:'string',minLength:5,maxLength:400},
  sourceUrl:{type:'string',minLength:12,maxLength:2048},
  seed:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$'},
  rowsPerTable:{type:'integer',minimum:1,maximum:100},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128}},
 required:['projectId','branchId','runId','endpointId','databaseName','roleName']
};
async function targetFor(a,c,verifyTarget){
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
 return {target,expiry};
}
export function createDemoSeedHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 runner=applyGuardedSql,fetchSource=fetchPublicSource,
 admissionsFor=c=>createSqlAdmissions({db:c.db}),
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env}),
 autoPlanFor=null
}={}){
 async function loadAuto(a,c,target,key){
  if(typeof autoPlanFor==='function')
   return autoPlanFor({args:a,ctx:c,target,requestKey:key});
  const layer=sqlFactory(c);
  const query=async(text,params)=>{
   const result=await runAuthorizedSqlRead({ctx:c,target,text,params,sqlLayer:layer});
   if(result?.done!==true||result.truncated===true||!Array.isArray(result.rows))
    throw Error('Safe bounded development-schema catalog read unavailable');
   return result.rows;
  };
  return compileAutoSeed({existingSchema:a.existingSchema,
   rowsPerTable:a.rowsPerTable??3,requestKey:key,query});
 }
 const definition=defineWrite({name:'neon_dev_seed',productionEffect:'none',
  plan:async(a,c)=>{
   const state=await targetFor(a,c,verifyTarget);
   const key=c.writeKey('neon_dev_seed',a);
   if(a.sourceUrl!==undefined){
    if(a.scenario!==undefined||a.description!==undefined||
       a.seed!==undefined||a.rowsPerTable!==undefined||a.existingSchema!==undefined)
     throw Error('Public import cannot be combined with a synthetic scenario');
    const source=await fetchSource(a.sourceUrl);
    const importPlan=compilePublicImport({source,requestKey:key});
    return {projectId:state.target.projectId,branchId:state.target.branchId,
     target:'dev-public-import:'+state.target.projectId+'/'+state.target.branchId+
      '/'+state.target.database+'/'+importPlan.schema,
     before:{...state,mode:'public',importPlan,requestKey:key},
     summary:'Import '+importPlan.totalRows+' checked rows into one isolated '+
      importPlan.schema+'.import_rows table with '+importPlan.columns.length+
      ' columns, source host '+importPlan.sourceHost+
      '. Public CSV/JSON only, max 10 MB, no redirects, pinned TLS/DNS; '+
      'reject personal secrets, foreign emails or unsafe phones. '+
      'No production writes or provider resources. Confirm once.'};
   }
   if(a.scenario==='auto'){
    if(a.sourceUrl!==undefined||a.description!==undefined||
       a.existingSchema===undefined)
     throw Error('Existing-schema auto mode needs an explicit schema only');
    if(await c.guards?.checkApp?.({projectId:state.target.projectId,
      branchId:state.target.branchId,target:'branch:'+state.target.branchId},
      c,{...a,outsideApp:false})!==true)
     throw Error('Application-owned schema cannot be auto-seeded');
    const autoPlan=await loadAuto(a,c,state.target,key);
    return {projectId:state.target.projectId,branchId:state.target.branchId,
     target:'dev-auto:'+state.target.projectId+'/'+state.target.branchId+
      '/'+state.target.database+'/'+autoPlan.schema,
     before:{...state,mode:'auto',autoPlan,requestKey:key},
     summary:'Insert '+autoPlan.totalRows+' fabricated rows into '+
      autoPlan.tableCount+' catalog-verified existing dev tables in '+
      autoPlan.schema+', with '+autoPlan.totalSkipped+
      ' rejected or dependent rows skipped. No existing rows changed. '+
      'Only supported foreign keys and constraints; no production or app-owned writes.'};
   }
   if(a.existingSchema!==undefined)
    throw Error('Existing schema is exclusive to auto mode');
   const chosen=chooseDemoScenario(a);
   const seedPlan=compileDemoSeed({
    scenario:chosen.scenario,seed:a.seed??'demo',rowsPerTable:a.rowsPerTable??3,
    requestKey:key});
   return {projectId:state.target.projectId,branchId:state.target.branchId,
    target:'dev-seed:'+state.target.projectId+'/'+state.target.branchId+
     '/'+state.target.database+'/'+seedPlan.schema,
    before:{...state,mode:'demo',seedPlan,requestKey:key},
    summary:'Create isolated '+seedPlan.schema+' with '+seedPlan.totalRows+
     ' fabricated '+chosen.scenario+' rows in five foreign-key ordered tables on run '+
     a.runId+'. No customer data, existing-schema changes, provider provisioning'+
     ' or production writes. Review the bounded SQL and confirm once.'};
  },
  apply:async(a,c,{before,requestKey})=>{
   const state=await targetFor(a,c,verifyTarget);
   if(requestKey!==before.requestKey||
      JSON.stringify(state)!==JSON.stringify({target:before.target,expiry:before.expiry}))
    throw Error('Run, scope or target changed after preview');
   let plan,verifyPlan;
   if(before.mode==='public'){
    if(a.sourceUrl===undefined||a.scenario!==undefined||
       a.description!==undefined||a.seed!==undefined||
       a.rowsPerTable!==undefined)
     throw Error('Import source input changed since preview');
    const source=await fetchSource(a.sourceUrl);
    plan=compilePublicImport({source,requestKey});
    if(plan.schema!==before.importPlan.schema||
       plan.sourceHash!==before.importPlan.sourceHash||
       plan.totalRows!==before.importPlan.totalRows)
     throw Error('Public file changed after owner preview; no SQL was sent');
    verifyPlan=verifyPublicImport;
   }else if(before.mode==='auto'){
    if(a.scenario!=='auto'||a.description!==undefined||
       a.sourceUrl!==undefined||a.existingSchema===undefined)
     throw Error('Auto seed inputs changed since preview');
    plan=await loadAuto(a,c,state.target,requestKey);
    if(plan.fingerprint!==before.autoPlan.fingerprint)
     throw Error('Existing schema or preflight conflicts changed; no SQL sent');
    verifyPlan=verifyAutoSeed;
   }else{
    if(a.sourceUrl!==undefined||a.existingSchema!==undefined)
     throw Error('Expected a synthetic seed source');
    const chosen=chooseDemoScenario(a);
    plan=compileDemoSeed({
     scenario:chosen.scenario,seed:a.seed??'demo',rowsPerTable:a.rowsPerTable??3,
     requestKey});
    if(plan.schema!==before.seedPlan.schema)
     throw Error('Seed identity changed since preview');
    verifyPlan=verifyDemoSeed;
   }
   const sqlLayer=sqlFactory(c);
   const inner='rmcp_devseed_'+createHash('sha256')
    .update(requestKey).digest('hex').slice(0,40);
   const sqlSpendAdmission=admissionsFor(c).sqlSpendAdmission;
   const result=await runner({
    ctx:{...c,checkApp:async target=>
      c.guards.checkApp(target,c,{...a,outsideApp:false}),sqlSpendAdmission},
    target:state.target,statements:plan.statements,params:plan.params,
    requestKey:inner,confirm:true,expectedAffectedRows:plan.expectedAffectedRows,
    sqlLayer,verifyReadBack:async()=>{
     const observation=await sqlLayer({
      neonOrg:c.connection.neonOrg,
      projectScope:c.connection.projectScope??null
     },state.target,async client=>verifyPlan({
      plan,query:async(sql,params)=>{
       const cls=await classifySql(sql);
       if(cls.kind!=='read'||cls.unknownNode===true)
        throw Error('Internal seed readback is not an AST-verified read');
       return client.query(sql,params);
      }
     }));
     return observation===true;
    }
   });
   c.devSeedResult=result;
   return {confirmed:result?.done===true&&result?.confirmed===true?true:
    result?.confirmed==='pending'?'pending':false};
  },
  readAfter:async(_a,c)=>c.devSeedResult,
  verify:async(_before,after)=>after?.done===true&&after?.confirmed===true
 });
 const tool={...definition.tool,inputSchema:schema,
  area:'developer',audience:['builder','owner'],profiles:['full'],
  description:'Owner-confirmed seed for isolated demos, supported existing dev schemas or vetted public CSV/JSON; exact readback, no production writes.'};
 return {tools:[tool],handlers:{
  neon_dev_seed:async(a,raw)=>definition.handler(a,await contextFor(raw))
 }};
}
const built=createDemoSeedHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
},
  description:{type:'string',minLength:5,maxLength:400},
  sourceUrl:{type:'string',minLength:12,maxLength:2048},
  seed:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$'},
  rowsPerTable:{type:'integer',minimum:1,maximum:100},
  dryRun:{type:'boolean'},confirm:{type:'boolean'},
  requestKey:{type:'string',minLength:8,maxLength:128}},
 required:['projectId','branchId','runId','endpointId','databaseName','roleName']
};
async function targetFor(a,c,verifyTarget){
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
 return {target,expiry};
}
export function createDemoSeedHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 runner=applyGuardedSql,fetchSource=fetchPublicSource,
 admissionsFor=c=>createSqlAdmissions({db:c.db}),
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env})
}={}){
 const definition=defineWrite({name:'neon_dev_seed',productionEffect:'none',
  plan:async(a,c)=>{
   const state=await targetFor(a,c,verifyTarget);
   const key=c.writeKey('neon_dev_seed',a);
   if(a.sourceUrl!==undefined){
    if(a.scenario!==undefined||a.description!==undefined||
       a.seed!==undefined||a.rowsPerTable!==undefined)
     throw Error('Public import cannot be combined with a synthetic scenario');
    const source=await fetchSource(a.sourceUrl);
    const importPlan=compilePublicImport({source,requestKey:key});
    return {projectId:state.target.projectId,branchId:state.target.branchId,
     target:'dev-public-import:'+state.target.projectId+'/'+state.target.branchId+
      '/'+state.target.database+'/'+importPlan.schema,
     before:{...state,mode:'public',importPlan,requestKey:key},
     summary:'Import '+importPlan.totalRows+' checked rows into one isolated '+
      importPlan.schema+'.import_rows table with '+importPlan.columns.length+
      ' columns, source host '+importPlan.sourceHost+
      '. Public CSV/JSON only, max 10 MB, no redirects, pinned TLS/DNS; '+
      'reject personal secrets, foreign emails or unsafe phones. '+
      'No production writes or provider resources. Confirm once.'};
   }
   const chosen=chooseDemoScenario(a);
   const seedPlan=compileDemoSeed({
    scenario:chosen.scenario,seed:a.seed??'demo',rowsPerTable:a.rowsPerTable??3,
    requestKey:key});
   return {projectId:state.target.projectId,branchId:state.target.branchId,
    target:'dev-seed:'+state.target.projectId+'/'+state.target.branchId+
     '/'+state.target.database+'/'+seedPlan.schema,
    before:{...state,mode:'demo',seedPlan,requestKey:key},
    summary:'Create isolated '+seedPlan.schema+' with '+seedPlan.totalRows+
     ' fabricated '+chosen.scenario+' rows in five foreign-key ordered tables on run '+
     a.runId+'. No customer data, existing-schema changes, provider provisioning'+
     ' or production writes. Review the bounded SQL and confirm once.'};
  },
  apply:async(a,c,{before,requestKey})=>{
   const state=await targetFor(a,c,verifyTarget);
   if(requestKey!==before.requestKey||
      JSON.stringify(state)!==JSON.stringify({target:before.target,expiry:before.expiry}))
    throw Error('Run, scope or target changed after preview');
   let plan,verifyPlan;
   if(before.mode==='public'){
    if(a.sourceUrl===undefined||a.scenario!==undefined||
       a.description!==undefined||a.seed!==undefined||
       a.rowsPerTable!==undefined)
     throw Error('Import source input changed since preview');
    const source=await fetchSource(a.sourceUrl);
    plan=compilePublicImport({source,requestKey});
    if(plan.schema!==before.importPlan.schema||
       plan.sourceHash!==before.importPlan.sourceHash||
       plan.totalRows!==before.importPlan.totalRows)
     throw Error('Public file changed after owner preview; no SQL was sent');
    verifyPlan=verifyPublicImport;
   }else{
    if(a.sourceUrl!==undefined)throw Error('Expected a synthetic seed source');
    const chosen=chooseDemoScenario(a);
    plan=compileDemoSeed({
     scenario:chosen.scenario,seed:a.seed??'demo',rowsPerTable:a.rowsPerTable??3,
     requestKey});
    if(plan.schema!==before.seedPlan.schema)
     throw Error('Seed identity changed since preview');
    verifyPlan=verifyDemoSeed;
   }
   const sqlLayer=sqlFactory(c);
   const inner='rmcp_devseed_'+createHash('sha256')
    .update(requestKey).digest('hex').slice(0,40);
   const sqlSpendAdmission=admissionsFor(c).sqlSpendAdmission;
   const result=await runner({
    ctx:{...c,checkApp:async target=>
      c.guards.checkApp(target,c,{...a,outsideApp:false}),sqlSpendAdmission},
    target:state.target,statements:plan.statements,params:plan.params,
    requestKey:inner,confirm:true,expectedAffectedRows:plan.expectedAffectedRows,
    sqlLayer,verifyReadBack:async()=>{
     const observation=await sqlLayer({
      neonOrg:c.connection.neonOrg,
      projectScope:c.connection.projectScope??null
     },state.target,async client=>verifyPlan({
      plan,query:async(sql,params)=>{
       const cls=await classifySql(sql);
       if(cls.kind!=='read'||cls.unknownNode===true)
        throw Error('Internal seed readback is not an AST-verified read');
       return client.query(sql,params);
      }
     }));
     return observation===true;
    }
   });
   c.devSeedResult=result;
   return {confirmed:result?.done===true&&result?.confirmed===true?true:
    result?.confirmed==='pending'?'pending':false};
  },
  readAfter:async(_a,c)=>c.devSeedResult,
  verify:async(_before,after)=>after?.done===true&&after?.confirmed===true
 });
 const tool={...definition.tool,inputSchema:schema,
  area:'developer',audience:['builder','owner'],profiles:['full'],
  description:'Seed synthetic demonstrations or import vetted public CSV/JSON into a new dev-only table with audited exact readback.'};
 return {tools:[tool],handlers:{
  neon_dev_seed:async(a,raw)=>definition.handler(a,await contextFor(raw))
 }};
}
const built=createDemoSeedHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
