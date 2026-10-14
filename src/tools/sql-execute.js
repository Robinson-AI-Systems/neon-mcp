// D-5: publicly registered SQL writes reuse B-1 and B-3, never raw driver SQL.
// Every change must be confirmed, row-bounded, audited and independently read back.
import {createHash} from 'node:crypto';
import {parse} from 'libpg-query';
import {defineWrite} from '../core/write.js';
import {classifySql} from '../neon/sql-guard.js';
import {createSqlAdmissions} from '../neon/sql-admission.js';
import {applyGuardedSql} from '../neon/sql-apply.js';
import {runPublicSqlQuery} from '../neon/sql-run.js';
import {createSqlLayer} from '../neon/sql.js';
import {createKeyVault} from '../neon/keys.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {verifyConnectionTarget} from './connections.js';
import {checkedPreviewStatements} from './sql-preview.js';

const id={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
const name={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const param={type:['string','number','boolean','null']};
const query={type:'string',minLength:1,maxLength:20000};
const value=v=>v===null||typeof v==='boolean'||
 typeof v==='number'&&Number.isFinite(v)||
 typeof v==='string'&&v.length<=128;
const values=v=>Array.isArray(v)&&v.length<=100&&v.every(x=>
 x===null||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x)||
 typeof x==='string'&&x.length<=8192);
const rowsValid=v=>Array.isArray(v)&&v.length<=10&&v.every(row=>
 row&&typeof row==='object'&&!Array.isArray(row)&&
 Object.keys(row).length>=1&&Object.keys(row).length<=16&&
 Object.entries(row).every(([key,val])=>key.length>=1&&key.length<=63&&value(val)));
const list=(a,transaction)=>transaction?a.statements:[a.statement];
const parameters=(a,transaction,statements)=>transaction?a.params??statements.map(()=>[]):
 [a.params??[]];
const numbers=x=>Array.isArray(x)&&x.length>=1&&x.length<=20&&
 x.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000);
async function validate(a,c,transaction,verifyTarget){
 if(c?.connection?.profile!=='full')throw Error('SQL writes require full owner authorization');
 const statements=list(a,transaction),params=parameters(a,transaction,statements);
 if(!Array.isArray(statements)||statements.length<1||statements.length>20||
    statements.some(s=>typeof s!=='string'||s.length<1||s.length>20000)||
    !Array.isArray(params)||params.length!==statements.length||
    params.some(v=>!values(v)))
  throw Error('Supply safe SQL statements and positional parameters');
 const cls=await Promise.all(statements.map(classifySql));
 await checkedPreviewStatements(statements);
 if(cls.some(x=>!['write','ddl','destructive'].includes(x.kind)||
    x.unknownNode===true||x.fullTable&&a.allowFullTable!==true))
  throw Error('Unsafe or unbounded SQL changes are refused');
 const expected=a.expectedAffectedRows;
 if(!numbers(expected)||expected.length!==statements.length)
  throw Error('Require a bounded expected affected-row count per statement');
 const assertion=a.assertion;
 if(!assertion||typeof assertion.query!=='string'||
    assertion.query.length<1||assertion.query.length>20000||
    !values(assertion.params??[])||!rowsValid(assertion.expectedRows))
  throw Error('Require an explicit bounded SQL readback assertion');
 let parsed;
 try{parsed=await parse(assertion.query);}catch{throw Error('Readback assertion SQL cannot be parsed');}
 if(parsed?.stmts?.length!==1||!parsed.stmts[0]?.stmt?.SelectStmt||
   (await classifySql(assertion.query)).kind!=='read')
  throw Error('Readback must be one AST-verified read-only SELECT');
 const t=await verifyTarget(a,c);
 if(t?.pid!==a.projectId||t?.bid!==a.branchId||
    t.endpointId!==a.endpointId||t.database!==a.databaseName||
    t.role!==a.roleName||typeof t.endpoint?.host!=='string')
  throw Error('Selected compute, database and role were not independently verified');
 const target={projectId:t.pid,branchId:t.bid,database:t.database,role:t.role,
  endpointId:t.endpointId,expectedEndpointHost:t.endpoint.host,pooled:false};
 return {target,statements,params,expected,assertion,transaction};
}
function assertionMatches(result,assertion){
 if(result?.done!==true||!Array.isArray(result.rows)||
    result.truncated===true||result.columnsCapped===true||
    result.cellsCapped===true||result.rowCount!==assertion.expectedRows.length)
  return false;
 return JSON.stringify(result.rows)===JSON.stringify(assertion.expectedRows);
}
const schemaBase={projectId:id,branchId:id,endpointId:id,databaseName:name,roleName:name,
 expectedAffectedRows:{type:'array',minItems:1,maxItems:20,items:{type:'integer',minimum:0,maximum:1000000}},
 assertion:{type:'object',properties:{
  query,params:{type:'array',maxItems:100,items:param},
  expectedRows:{type:'array',maxItems:10,items:{type:'object',
   additionalProperties:{type:['string','number','boolean','null']}}}},
  required:['query','expectedRows'],additionalProperties:false},
 previewToken:{type:'string',minLength:40,maxLength:100},
 acceptEstimate:{type:'boolean'},allowFullTable:{type:'boolean'},
 dryRun:{type:'boolean'},confirm:{type:'boolean'},outsideApp:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128}};
function inputSchema(transaction){
 return {type:'object',properties:{...schemaBase,
  ...(transaction?{
    statements:{type:'array',minItems:1,maxItems:20,items:query},
    params:{type:'array',maxItems:20,items:{type:'array',maxItems:100,items:param}}
   }:{
    statement:query,params:{type:'array',maxItems:100,items:param}})},
  required:['projectId','branchId','endpointId','databaseName','roleName',
   'expectedAffectedRows','assertion',transaction?'statements':'statement'],
  additionalProperties:false};
}
export function createSqlExecuteHandlers({
 contextFor=createProjectWriteContext,
 verifyTarget=verifyConnectionTarget,
 runner=applyGuardedSql,
 queryRunner=runPublicSqlQuery,
 sqlFactory=c=>createSqlLayer({db:c.db,
  vault:createKeyVault({db:c.db,env:c.env}),env:c.env})
}={}){
 const tools=[],handlers={};
 for(const [toolName,transaction] of [
  ['neon_sql_execute',false],['neon_sql_execute_transaction',true]]){
  const definition=defineWrite({name:toolName,destructive:true,access:true,
   plan:async(a,c)=>{
    const prepared=await validate(a,c,transaction,verifyTarget);
    return {target:'sql:'+prepared.target.projectId+'/'+prepared.target.branchId+
      '/'+prepared.target.database,projectId:prepared.target.projectId,
     branchId:prepared.target.branchId,before:prepared,
     summary:'Confirmed '+(transaction?'atomic SQL transaction of ':'SQL change with ')+
      prepared.statements.length+' classified statement(s) on branch '+
      prepared.target.branchId+'; expected affected rows '+
      prepared.expected.join(',')+
      '. Data changes may be destructive. An independent bound SELECT must match'+
      ' the specified postcondition before the audit can claim success.'};
   },
   apply:async(a,c,{before,requestKey})=>{
    const current=await validate(a,c,transaction,verifyTarget);
    if(JSON.stringify(current.target)!==JSON.stringify(before.target))
     throw Error('Scoped SQL compute identity changed after confirmation');
    const sqlLayer=sqlFactory(c);
    const admissions=createSqlAdmissions({db:c.db});
    const checkApp=async(target)=>
     c.guards.checkApp({target:'sql:'+target.projectId+'/'+target.branchId+
       '/'+target.database,projectId:target.projectId,
       branchId:target.branchId},c,a);
    // The B-1 wrapper already reserved its own audited key. B-3 makes
    // an independent, deterministic inner claim to prevent ambiguous replay
    // and to consume an exact production preview token at most once.
    const internalKey='rmcp_sql_inner_'+createHash('sha256').update(requestKey)
     .digest('hex').slice(0,48);
    const result=await runner({
     ctx:{...c,checkApp,sqlSpendAdmission:admissions.sqlSpendAdmission},
     target:current.target,statements:current.statements,params:current.params,
     requestKey:internalKey,previewToken:a.previewToken,
     confirm:true,acceptEstimate:a.acceptEstimate===true,
     allowFullTable:a.allowFullTable===true,
     expectedAffectedRows:current.expected,
     sqlLayer,
     verifyReadBack:async()=>{
      const observed=await queryRunner({ctx:c,target:current.target,
       text:current.assertion.query,params:current.assertion.params??[],sqlLayer});
      return assertionMatches(observed,current.assertion);
     }
    });
    c.lastSqlExecution=result;
    return {confirmed:result?.done===true&&result?.confirmed===true?
     true:result?.confirmed==='pending'?'pending':false};
   },
   readAfter:async(_a,c)=>c.lastSqlExecution,
   verify:(_before,after)=>after?.done===true&&after.confirmed===true
  });
  tools.push({...definition.tool,profiles:['full'],area:'sql',
   audience:['owner'],description:transaction?
    'Owner-confirmed atomic guarded 1–20 SQL changes with exact preview token for production, bound row counts and independent SELECT readback.':
    'Owner-confirmed guarded single SQL change with expected rows, production exact preview token and independent SELECT readback.',
   inputSchema:inputSchema(transaction)});
  handlers[toolName]=async(a,c)=>definition.handler(a,await contextFor(c));
 }
 return {tools,handlers};
}
const built=createSqlExecuteHandlers();
export const tools=built.tools;
export const handlers=built.handlers;
