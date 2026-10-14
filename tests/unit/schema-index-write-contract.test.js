import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {createMcpHandler,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {createIndexWriteHandlers,INDEX_INVENTORY_SQL} from '../../src/tools/schema-index-write.js';
import {TABLES_SQL,COLUMNS_SQL} from '../../src/tools/schema-reads.js';
import {handlers as metaHandlers,tools as metaTools} from '../../src/tools/meta.js';
import {runWriteContract,makeContractFixture} from '../../test/helpers/write-contract.js';
const base={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'public',tableName:'people',indexName:'people_idx'};
export const ordinaryIndex={index_oid:'123',index_name:'people_idx',table_name:'people',
 valid_index:true,ready_index:true,unique_index:false,primary_index:false,
 constraint_index:false,index_bytes:'8192',scans:'0',method:'btree',custom_expression:false,key_count:1,attribute_count:1,columns:['id']};
export function fixture(opts={},door='direct',remove=false){
 const name=remove?'neon_schema_drop_index':'neon_schema_create_index';
 const f=makeContractFixture(opts);let index=remove?{...ordinaryIndex}:null,server;
 f.ctx.connection={neonOrg:'org-fake',profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:base.branchId,default:opts.production===true});
 f.ctx.guards.checkProduction=async()=>({allowed:opts.production!==true,production:opts.production===true});
 f.ctx.guards.checkSpend=async()=>opts.spendCents!==2600;
 const impl=createIndexWriteHandlers({contextFor:async()=>f.ctx,
  verifyTarget:async a=>({pid:a.projectId,bid:a.branchId,endpointId:a.endpointId,
   database:a.databaseName,role:a.roleName,endpoint:{host:'direct.fake'}}),
  query:async({text})=>{
   const rows=text===TABLES_SQL?[{table_name:'people',relation_kind:'r'}]:
    text===COLUMNS_SQL?[{column_name:'id'}]:text===INDEX_INVENTORY_SQL?(index?[index]:[]):[];
   return {done:true,truncated:false,rowCount:rows.length,rows};},
  mutate:async()=>{f.calls.push('ddl');if(opts.throwOnWrite){if(opts.leaveInvalid)index={...ordinaryIndex,valid_index:false};throw Error('uncertain write');}
   if(opts.verify!==false)index=remove?null:{...ordinaryIndex};return {issued:true};}});
 const registry={tools:[...impl.tools,...metaTools],handlers:{...impl.handlers,...metaHandlers}};
 async function invoke(a){
  if(door!=='https')return dispatchReadOnlyTool({registry,
   name:door==='delegated'?'neon_call':name,args:door==='delegated'?{name,args:a}:a,
   connection:f.ctx.connection,db:f.ctx.db,env:{VERCEL_ENV:'production'}});
  if(!server){
   const wire=createMcpHandler({registry,db:{...f.ctx.db,
    listNeonOrgs:async()=>[{id:'org-fake',production_enabled:true}],
    getAccessToken:async()=>({profile:'full',listing:'catalog',mode:f.ctx.connection.mode,
     neon_org:'org-fake',client_id:'client-fake'})},
    env:{VERCEL_ENV:'production',PUBLIC_BASE_URL:'https://fake-owner.invalid'}});
   server=createServer(async(req,res)=>{res.status=n=>{res.statusCode=n;return res;};res.send=x=>res.end(JSON.stringify(x));
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    req.body=JSON.parse(Buffer.concat(chunks).toString());await wire(req,res);});
   await new Promise(r=>server.listen(0,'127.0.0.1',r));
  }
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/mcp',{
   method:'POST',headers:{authorization:'Bearer '+'f'.repeat(40),
    'content-type':'application/json',accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:a}})});
  const body=await response.text(),line=body.split('\n').find(x=>x.startsWith('data: '));
  const parsed=JSON.parse(line?line.slice(6):body);return parsed.result??parsed;
 }
 return {...f,tool:impl.tools.find(t=>t.name===name),handler:invoke,
  setIndex:x=>{index=x;},close:async()=>{if(server)await new Promise(r=>server.close(r));}};
}
describe('development concurrent index lifecycle through every door',()=>{
 for(const remove of [false,true])for(const door of ['direct','delegated','https'])
  it('nine cases '+(remove?'drop':'create')+' through '+door,async()=>{
   const instances=[];
   try{await runWriteContract(opts=>{const f=fixture(opts,door,remove);instances.push(f);return f;},
    {input:{...base,...(!remove?{columns:['id']}:{})},nonBillable:true,productionAllowed:false});}
   finally{for(const f of instances)await f.close();}
  });
 it('refuses production/protection drift immediately before DDL',async()=>{
  const f=fixture();f.ctx.getBranch=async()=>({id:base.branchId,protected:true});
  expect(f.parse(await f.handler({...base,columns:['id'],confirm:true},f.ctx)).confirmed).toBe('pending');
  expect(f.calls).toHaveLength(0);
 });
 it('refuses constraint, unique, expression and foreign-table indexes',async()=>{
  for(const change of [{constraint_index:true},{unique_index:true},{custom_expression:true},{table_name:'other'}]){
   const f=fixture({},'direct',true);f.setIndex({...ordinaryIndex,...change});
   expect(f.parse(await f.handler({...base,confirm:true},f.ctx)).done).toBe(false);expect(f.calls).toHaveLength(0);
  }
 });
 it('leaves ambiguous writes pending with observation only and no retry',async()=>{
  const f=fixture({throwOnWrite:true,leaveInvalid:true});
  const out=f.parse(await f.handler({...base,columns:['id'],confirm:true},f.ctx));
  expect(out).toMatchObject({confirmed:'pending',indexObservationOnly:true,observedIndex:{valid_index:false}});expect(f.calls).toHaveLength(1);
 });
});
