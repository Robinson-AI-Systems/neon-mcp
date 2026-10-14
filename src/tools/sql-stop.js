// Owner-confirmed cancellation of one scoped PostgreSQL query.
import {defineWrite} from '../core/write.js';
import {createProjectWriteContext} from '../neon/project-write-context.js';
import {verifyConnectionTarget} from './connections.js';
import {readId} from './read-descriptors.js';
import {roleSchema} from './role-write-shared.js';
import {requestScopedQueryCancellation,observeScopedQueryCancellation} from '../neon/sql-run.js';

const dbName={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_-]{0,62}$'};
const props={projectId:readId,branchId:readId,endpointId:readId,databaseName:dbName,
 roleName:roleSchema,pid:{type:'integer',minimum:1,maximum:2147483647},
 dryRun:{type:'boolean'},confirm:{type:'boolean'},
 requestKey:{type:'string',minLength:8,maxLength:128},
 outsideApp:{type:'boolean'}};
const inputSchema={type:'object',properties:props,
 required:['projectId','branchId','endpointId','databaseName','roleName','pid'],
 additionalProperties:false};
const chosen=t=>({projectId:t.pid,branchId:t.bid,endpointId:t.endpointId,
 expectedEndpointHost:t.endpoint.host,database:t.database,role:t.role,pooled:false});
const matches=(a,b)=>a.projectId===b.projectId&&a.branchId===b.branchId&&
 a.endpointId===b.endpointId&&a.expectedEndpointHost===b.expectedEndpointHost&&
 a.database===b.database&&a.role===b.role;
export function createSqlStopHandlers({contextFor=createProjectWriteContext,
 verifyTarget=verifyConnectionTarget,requestStop=requestScopedQueryCancellation,
 readStop=observeScopedQueryCancellation}={}){
 const stop=defineWrite({name:'neon_sql_stop_query',destructive:true,access:true,
  plan:async(a,c)=>{
   if(c.connection?.profile!=='full'||!Number.isSafeInteger(a.pid)||
      a.pid<1||a.pid>2147483647)
    throw Error('A full owner and valid query PID are required');
   const observed=await verifyTarget(a,c);
   if(observed.endpoint.current_state!=='active'||observed.endpoint.disabled!==false)
    throw Error('Cancellation never starts an idle or disabled compute');
   const t=chosen(observed);
   return {target:'branch:'+t.branchId,projectId:t.projectId,branchId:t.branchId,
    before:{target:t,pid:a.pid},
    summary:'Cancel the active query on PID '+a.pid+' in verified database '+
     t.database+' on compute '+t.endpointId+
     '; interruption may cause an application request to fail'};
  },
  apply:async(a,c,{before})=>{
   const observed=await verifyTarget(a,c);
   if(observed.endpoint.current_state!=='active'||observed.endpoint.disabled!==false)
    return {confirmed:'pending'};
   const t=chosen(observed);
   if(!matches(t,before.target)||a.pid!==before.pid)
    return {confirmed:'pending'};
   const outcome=await requestStop({ctx:c,target:t,pid:a.pid});
   if(outcome?.requested!==true||!outcome.signature)return {confirmed:false};
   c.cancelSignature=outcome.signature;
   return {confirmed:true};
  },
  readAfter:async(a,c,before)=>{
   const t=chosen(await verifyTarget(a,c));
   if(!matches(t,before.target)||c.cancelSignature?.pid!==a.pid)
    throw Error('The cancellation identity changed');
   return readStop({ctx:c,target:t,pid:a.pid,signature:c.cancelSignature});
  },
  verify:(_before,after)=>after?.finished===true
 });
 const tool={...stop.tool,profiles:['full'],area:'sql',audience:['owner','operator'],
  description:'Confirm audited cancellation of a single active query on a verified database.',
  inputSchema};
 return {tools:[tool],handlers:{neon_sql_stop_query:(a,c)=>
  contextFor(c).then(ctx=>stop.handler(a,ctx))}};
}
const generated=createSqlStopHandlers();
export const tools=generated.tools;
export const handlers=generated.handlers;
