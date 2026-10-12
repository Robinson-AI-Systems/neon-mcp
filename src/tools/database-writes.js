// D-4: guarded database lifecycle. All changes use B-1 durable audit and read-back.
import {defineWrite} from '../core/write.js';
import {projectScope,projectRead} from './project-context.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {applyNeonWrite} from '../neon/write-neon.js';

const validId=x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/.test(x);
const validName=x=>typeof x==='string'&&/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(x);
const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const dbName={type:'string',minLength:1,maxLength:63,pattern:'^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$'};
const common={projectId:id,branchId:id,dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128},outsideApp:{type:'boolean'}};
const schema=(props,required)=>({type:'object',properties:{...common,...props},
 required,additionalProperties:false});

function scoped(a,c){
 const pid=projectScope(c,a.projectId??null).projectId;
 if(!pid||!validId(a.branchId))throw Error('Choose a scoped project and branch');
 return {pid,bid:a.branchId,path:{project_id:pid,branch_id:a.branchId}};
}
async function identity(a,c){
 const {pid,bid,path}=scoped(a,c),client=await c.clientFor(pid);
 const [p,b]=await Promise.all([
  projectRead(client,'getProject',{path:{project_id:pid}}),
  projectRead(client,'getProjectBranch',{path})
 ]);
 if(p?.project?.id!==pid||p.project.org_id!==c.connection.neonOrg||
    b?.branch?.id!==bid||b.branch.project_id!==pid)
  throw Error('Database target project/branch identity unverified');
 return {pid,bid,path,client,branch:b.branch};
}
function databaseMatches(db,name,bid){
 return db?.name===name&&db.branch_id===bid&&Number.isSafeInteger(db.id)&&
  validName(db.owner_name);
}
async function existing(a,c,name=a.databaseName){
 if(!validName(name))throw Error('Select a database name');
 const t=await identity(a,c);
 const d=(await projectRead(t.client,'getProjectBranchDatabase',{
  path:{...t.path,database_name:name}}))?.database;
 if(!databaseMatches(d,name,t.bid))throw Error('Database identity cannot be independently verified');
 return {...t,db:d};
}
async function ownerRole(t,name){
 if(!validName(name))throw Error('Choose a valid owner role');
 const role=(await projectRead(t.client,'getProjectBranchRole',{
  path:{...t.path,role_name:name}}))?.role;
 if(role?.name!==name||role.branch_id!==t.bid||role.protected===true)
  throw Error('Database owner role cannot be verified or is protected');
}
async function inventory(t){
 const data=await projectRead(t.client,'listProjectBranchDatabases',{path:t.path});
 if(!Array.isArray(data?.databases)||data.pagination?.cursor||
    data.databases.some(d=>d.branch_id!==t.bid||!validName(d.name)||!validName(d.owner_name)))
  throw Error('Complete database inventory is required before mutation');
 return data.databases;
}
const target=t=>({target:'branch:'+t.bid,projectId:t.pid,branchId:t.bid});
const apply=(a,c,key,operationId,body,dbNameArg)=>applyNeonWrite({
 client:await c.clientFor(scoped(a,c).pid),operationId,
 params:{path:{...scoped(a,c).path,...(dbNameArg?{database_name:dbNameArg}:{})},
  ...(body?{body:{database:body}}:{})},
 projectId:scoped(a,c).pid,requestKey:key
});

const create=defineWrite({name:'neon_database_create',
 plan:async(a,c)=>{
  if(!validName(a.name)||!validName(a.ownerName))throw Error('Valid name and owner required');
  const t=await identity(a,c);
  await ownerRole(t,a.ownerName);
  const all=await inventory(t);
  if(all.some(d=>d.name===a.name))throw Error('Database already exists');
  return {...target(t),before:{name:a.name,ownerName:a.ownerName},
   summary:'Create database '+a.name+' owned by '+a.ownerName+' on branch '+t.bid};
 },
 apply:(a,c,{requestKey:key})=>apply(a,c,key,'createProjectBranchDatabase',
  {name:a.name,owner_name:a.ownerName}),
 readAfter:async(a,c)=>{const t=await identity(a,c);
  return (await projectRead(t.client,'getProjectBranchDatabase',{
   path:{...t.path,database_name:a.name}}))?.database;},
 verify:(before,after,a)=>databaseMatches(after,a.name,a.branchId)&&
  after.owner_name===before.ownerName
});
const update=defineWrite({name:'neon_database_update',
 plan:async(a,c)=>{
  const t=await existing(a,c);
  if(a.name!==undefined&&!validName(a.name))throw Error('Invalid new database name');
  if(a.ownerName!==undefined&&!validName(a.ownerName))throw Error('Invalid owner name');
  if(a.name===undefined&&a.ownerName===undefined)
   throw Error('Select database rename or owner change');
  const finalName=a.name??t.db.name,finalOwner=a.ownerName??t.db.owner_name;
  if(finalName===t.db.name&&finalOwner===t.db.owner_name)
   throw Error('Database settings are unchanged');
  if(finalOwner!==t.db.owner_name)await ownerRole(t,finalOwner);
  if(finalName!==t.db.name&&
     (await inventory(t)).some(d=>d.name===finalName))
   throw Error('New database name already exists');
  return {...target(t),before:{id:t.db.id,name:t.db.name,ownerName:t.db.owner_name,
   finalName,finalOwner},
   summary:'Change database '+t.db.name+' to '+finalName+' (owner '+finalOwner+
    '); app connections and privileges may break'};
 },
 apply:(a,c,{requestKey:key})=>apply(a,c,key,'updateProjectBranchDatabase',
  {...(a.name!==undefined?{name:a.name}:{}),
   ...(a.ownerName!==undefined?{owner_name:a.ownerName}:{})},a.databaseName),
 readAfter:async(a,c,before)=>{const t=await identity(a,c);
  return (await projectRead(t.client,'getProjectBranchDatabase',{
   path:{...t.path,database_name:before.finalName}}))?.database;},
 verify:(before,after,a)=>databaseMatches(after,before.finalName,a.branchId)&&
  after.id===before.id&&after.owner_name===before.finalOwner
});
const remove=defineWrite({name:'neon_database_delete',destructive:true,
 plan:async(a,c)=>{
  const t=await existing(a,c),all=await inventory(t);
  if(!all.some(d=>d.name===t.db.name&&d.id===t.db.id))
   throw Error('Database inventory does not confirm the target');
  return {...target(t),before:{id:t.db.id,name:t.db.name,ownerName:t.db.owner_name},
   summary:'PERMANENTLY DELETE database '+t.db.name+' on '+t.bid+
    '; its data, tables and active connections may be lost; no automatic recovery'};
 },
 apply:(a,c,{requestKey:key})=>apply(a,c,key,'deleteProjectBranchDatabase',
  null,a.databaseName),
 readAfter:async(a,c)=>inventory(await identity(a,c)),
 verify:(before,after)=>Array.isArray(after)&&
  !after.some(d=>d.name===before.name||d.id===before.id)
});
const defs=[
 [create,'Create a database only after verified owner and branch identity.',
  schema({name:dbName,ownerName:dbName},['branchId','name','ownerName'])],
 [update,'Rename a database or change owner with verified before/after state.',
  schema({databaseName:dbName,name:dbName,ownerName:dbName},['branchId','databaseName'])],
 [remove,'Delete a database after explicit confirmation and complete inventory.',
  schema({databaseName:dbName},['branchId','databaseName'])]
];
export const tools=defs.map(([def,description,inputSchema])=>({...def.tool,
 description,inputSchema,profiles:['full'],area:'databases',audience:['owner','operator']}));
export function createDatabaseWriteHandlers({contextFor=createProjectWriteContext}={}){
 return Object.fromEntries(defs.map(([def])=>[def.tool.name,async(a,c)=>
  def.handler(a,await contextFor(c))]));
}
export const handlers=createDatabaseWriteHandlers();
