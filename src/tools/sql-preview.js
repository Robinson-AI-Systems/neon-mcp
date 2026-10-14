// D-5: owner-confirmed SQL rehearsal only on a disposable Neon child branch.
// The parent is never modified. B-1 and B-4 are admitted before any child creation.
import {defineWrite} from '../core/write.js';
import {verifyConnectionTarget} from './connections.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {classifySql} from '../neon/sql-guard.js';
import {parse} from 'libpg-query';
import {createSqlExactPreview} from '../neon/sql-preview.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const dbName={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const param={type:['string','number','boolean','null']};
const safeStatement=s=>typeof s==='string'&&s.length>=1&&s.length<=20000;
function paramsFor(a){
 if(!Array.isArray(a.statements)||a.statements.length<1||a.statements.length>20||
    a.statements.some(s=>!safeStatement(s)))throw Error('Select one to 20 SQL change statements');
 const params=a.params??a.statements.map(()=>[]);
 if(!Array.isArray(params)||params.length!==a.statements.length||
    params.some(row=>!Array.isArray(row)||row.length>100||
     row.some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean'||
      typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>8192)))
  throw Error('Supply safe positional parameters for each SQL change');
 return params;
}

const previewableRoots=new Set(['InsertStmt','UpdateStmt','DeleteStmt','MergeStmt',
 'CreateStmt','AlterTableStmt','DropStmt','IndexStmt','ViewStmt',
 'CreateFunctionStmt','CreateSchemaStmt','CreateSeqStmt','AlterSeqStmt',
 'CreateTrigStmt','CreatePolicyStmt','AlterPolicyStmt','CreateEnumStmt',
 'AlterEnumStmt','RenameStmt','CommentStmt','CreatePublicationStmt',
 'CreateTableAsStmt','CompositeTypeStmt','GrantStmt']);
export async function checkedPreviewStatements(statements){
 for(const sql of statements){
  let ast;
  try{ast=await parse(sql)}catch{throw Error('SQL preview statement is not valid PostgreSQL');}
  if(ast?.stmts?.length!==1||
     !previewableRoots.has(Object.keys(ast.stmts[0]?.stmt??{})[0]))
   throw Error('Procedural or unrecognized SQL is not safe for isolated change preview');
 }
}
async function verifiedPlan(a,c,verifyTarget=verifyConnectionTarget){
 if(c?.connection?.profile!=='full')
  throw Error('SQL preview requires full owner authorization');
 const params=paramsFor(a);
 await checkedPreviewStatements(a.statements);
 const sqlClasses=await Promise.all(a.statements.map(classifySql));
 if(sqlClasses.some(x=>!['write','ddl','destructive'].includes(x.kind)||
    x.unknownNode===true))
  throw Error('Only approved change statements may run on the disposable preview branch');
 if(sqlClasses.some(x=>x.fullTable)&&a.allowFullTable!==true)
  throw Error('Explicit full-table acknowledgment required for unbounded changes');
 const t=await verifyTarget(a,c);
 if(t?.pid!==a.projectId||t?.bid!==a.branchId||
    t.endpointId!==a.endpointId||t.database!==a.databaseName||
    t.role!==a.roleName||typeof t.endpoint?.host!=='string')
  throw Error('Exact Neon project, branch, endpoint, database and role not verified');
 return {target:{projectId:t.pid,branchId:t.bid,endpointId:t.endpointId,
   expectedEndpointHost:t.endpoint.host,database:t.database,
   role:t.role,pooled:false},classes:sqlClasses,params};
}
export function createSqlPreviewHandlers({
 contextFor=createProjectWriteContext,verifyTarget=verifyConnectionTarget,
 createPreview=createSqlExactPreview,sqlFactory=c=>createSqlLayer({
  db:c.db,vault:createKeyVault({db:c.db,env:c.env}),env:c.env})
}={}){
 const definition=defineWrite({name:'neon_sql_preview_change',
  destructive:true,access:true,
  // This existing B-4 preliminary 1-cent reserve is a conservative admission
  // unit, not a claim that Neon billable preview usage costs only 1 cent.
  // Any owner authorization must cover actual metered usage separately.
  spend:async()=>({increaseCents:1,estimate:true,canApply:true}),
  plan:async(a,c)=>{
   const prepared=await verifiedPlan(a,c,verifyTarget);
   return {target:'sql-preview:'+prepared.target.projectId+'/'+prepared.target.branchId,
    projectId:prepared.target.projectId,branchId:prepared.target.branchId,
    before:prepared,
    summary:'Rehearse '+a.statements.length+' classified SQL change(s) on a'+
     ' disposable child of branch '+prepared.target.branchId+
     '; no parent changes. Child compute may incur usage charges, live'+
     ' owner spend approval is required, all SQL effects are isolated.'};
  },
  apply:async(a,c,{before,requestKey})=>{
   // A fresh provider read blocks stale target selection between preview
   // and confirmed execution. Never use credentials or trust flags from args.
   const fresh=await verifiedPlan(a,c,verifyTarget);
   if(JSON.stringify(fresh.target)!==JSON.stringify(before.target))
    throw Error('SQL preview target has changed');
   const result=await createPreview({ctx:{
     ...c,checkApp:async(target)=>
      c.guards.checkApp({target:'sql-preview:'+target.projectId+'/'+target.branchId,
       projectId:target.projectId,branchId:target.branchId},c,a),
     previewAdmission:async()=>true,
     allowFullTable:a.allowFullTable===true
    },target:fresh.target,statements:a.statements,params:fresh.params,
    requestKey,neonClient:await c.clientFor(fresh.target.projectId),
    sqlLayer:sqlFactory(c)});
   // B-3 verified both cleanup and durable preview record before returning
   // the one-use token. Never expose it if the write audit did not complete.
   c.ephemeralSqlPreview=result?.done===true&&result.exact===true&&
    result.childDeleted===true?result:null;
   return {confirmed:c.ephemeralSqlPreview!==null};
  },
  readAfter:async(_a,c)=>c.ephemeralSqlPreview,
  verify:(_before,after)=>after?.done===true&&after.exact===true&&
   after.childDeleted===true&&
   typeof after.previewToken==='string'&&after.previewToken.length>=40
 });
 const tool={...definition.tool,profiles:['full'],area:'sql',audience:['owner'],
  description:'Confirm isolated SQL rehearsal, priced cleanup and a one-use token.',
  inputSchema:{type:'object',properties:{
   projectId:id,branchId:id,endpointId:id,databaseName:dbName,roleName:dbName,
   statements:{type:'array',minItems:1,maxItems:20,items:{type:'string',minLength:1,maxLength:20000}},
   params:{type:'array',maxItems:20,items:{type:'array',maxItems:100,items:param}},
   allowFullTable:{type:'boolean'},dryRun:{type:'boolean'},confirm:{type:'boolean'},
   outsideApp:{type:'boolean'},
   requestKey:{type:'string',minLength:8,maxLength:128}},
   required:['projectId','branchId','endpointId','databaseName','roleName','statements'],
   additionalProperties:false}};
 return {tools:[tool],handlers:{async neon_sql_preview_change(a,c){
  const trusted=await contextFor(c);
  // Ephemeral tokens never enter durable write logs, GitHub or tool previews.
  const response=await definition.handler(a,trusted);
  const result=JSON.parse(response.content[0].text);
  if(result?.confirmed===true&&trusted.ephemeralSqlPreview?.previewToken){
   response.content[0].text=JSON.stringify({...result,
    exact:true,affectedRows:trusted.ephemeralSqlPreview.affectedRows,
    schemaChanged:trusted.ephemeralSqlPreview.schemaChanged,
    childDeleted:true,previewToken:trusted.ephemeralSqlPreview.previewToken,
    validForMinutes:trusted.ephemeralSqlPreview.validForMinutes});
  }
  return response;
 }}};
}
const built=createSqlPreviewHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
