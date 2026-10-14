import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {createMcpHandler,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {createReindexHandlers} from '../../src/tools/health-reindex.js';
import {INDEX_INVENTORY_SQL} from '../../src/tools/schema-index-write.js';
import {TABLES_SQL} from '../../src/tools/schema-reads.js';
import {handlers as metaHandlers,tools as metaTools} from '../../src/tools/meta.js';
import {runWriteContract,makeContractFixture} from '../../test/helpers/write-contract.js';
const base={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'public',tableName:'people'};
const first={index_oid:'123',index_name:'people_code_idx',table_name:'people',
 valid_index:true,ready_index:true,unique_index:false,primary_index:false,
 constraint_index:false,exclusion_index:false,index_bytes:'8192',scans:'0',method:'btree',
 custom_expression:false,key_count:1,attribute_count:1,columns:['code']};
function fixture(opts={},door='direct'){
 const f=makeContractFixture(opts);let index={...first},artifacts=[],server;
 f.ctx.guards.checkSpend=async()=>opts.spendCents!==2600;
 const tool='neon_health_reindex';
 f.ctx.connection={neonOrg:'org-fake',profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:base.branchId,default:opts.production===true});
 const impl=createReindexHandlers({contextFor:async()=>f.ctx,
  verifyTarget:async a=>({pid:a.projectId,bid:a.branchId,endpointId:a.endpointId,
   database:a.databaseName,role:a.roleName,endpoint:{host:'direct.fake'}}),
  query:async({text})=>{
   const rows=text===TABLES_SQL?[{table_name:'people',relation_kind:'r'}]:
    text===INDEX_INVENTORY_SQL?[index,...artifacts]:[];
   return {done:true,truncated:false,rowCount:rows.length,rows};
  },
  mutate:async()=>{f.calls.push('ddl');
   if(opts.throwOnWrite){
    if(opts.leaveInvalid)index={...index,valid_index:false};
    if(opts.leaveArtifact)artifacts=[{...first,index_oid:'456',index_name:'people_code_idx_ccnew',
      valid_index:false,ready_index:false}];
    throw Error('uncertain');
   }
   if(opts.verify!==false)index={...index,index_oid:'456',index_bytes:'16384',scans:'1'};
   else index={...index,index_oid:'456',method:'hash'};
   return {issued:true};}});
 const registry={tools:[...impl.tools,...metaTools],handlers:{...impl.handlers,...metaHandlers}};
 async function invoke(args){
  if(door!=='https')return dispatchReadOnlyTool({registry,
   name:door==='delegated'?'neon_call':tool,
   args:door==='delegated'?{name:tool,args}:args,
   connection:f.ctx.connection,db:f.ctx.db,env:{VERCEL_ENV:'production'}});
  if(!server){
   const wire=createMcpHandler({registry,db:{...f.ctx.db,
    listNeonOrgs:async()=>[{id:'org-fake',production_enabled:true}],
    getAccessToken:async()=>({profile:'full',listing:'catalog',mode:f.ctx.connection.mode,
     neon_org:'org-fake',client_id:'client-fake'})},
    env:{VERCEL_ENV:'production',PUBLIC_BASE_URL:'https://fake-owner.invalid'}});
   server=createServer(async(req,res)=>{
    res.status=n=>{res.statusCode=n;return res;};
    res.send=x=>res.end(JSON.stringify(x));
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    req.body=JSON.parse(Buffer.concat(chunks).toString());await wire(req,res);
   });
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  }
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/mcp',{
   method:'POST',headers:{authorization:'Bearer '+'f'.repeat(40),
    'content-type':'application/json',accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:tool,arguments:args}})});
  const body=await response.text();
  const line=body.split('\n').find(x=>x.startsWith('data: '));
  const parsed=JSON.parse(line?line.slice(6):body);return parsed.result??parsed;
 }
 return {...f,handler:invoke,
  setIndex:x=>{index=x;},setArtifacts:x=>{artifacts=x;},
  close:async()=>{if(server)await new Promise(resolve=>server.close(resolve));}};
}
describe('D-9 guarded concurrent development reindex',()=>{
 for(const scope of ['index','table'])for(const door of ['direct','delegated','https'])
  it('nine write-contract cases '+scope+' via '+door,async()=>{
   const opened=[],input={...base,scope,...(scope==='index'?{indexName:first.index_name}:{})};
   try{await runWriteContract(opts=>{const f=fixture(opts,door);opened.push(f);return f;},
    {input,nonBillable:true,productionAllowed:false});}
   finally{for(const f of opened)await f.close();}
  });
 it('rejects missing, invalid, cross-target or partial catalogs',async()=>{
  const args={...base,scope:'index',indexName:first.index_name,confirm:true};
  for(const changed of [{valid_index:false},{ready_index:false},
   {table_name:'other'},{index_oid:'unexpected'},{columns:['code'],attribute_count:2}]){
   const f=fixture();f.setIndex({...first,...changed});
   const result=f.parse(await f.handler(args));
   expect(result.done).toBe(false);expect(f.calls).toHaveLength(0);
  }
 });
 it('refuses exclusion indexes for INDEX and TABLE reindex',async()=>{
 for(const scope of ['index','table']){
  const f=fixture();f.setIndex({...first,exclusion_index:true});
  const args={...base,scope,...(scope==='index'?{indexName:first.index_name}:{}),confirm:true};
  expect(f.parse(await f.handler(args)).done).toBe(false);
  expect(f.calls).toHaveLength(0);
 }
});
it('refuses production/protected targets immediately before DDL',async()=>{
  const f=fixture();f.ctx.getBranch=async()=>({id:base.branchId,protected:true});
  const result=f.parse(await f.handler({...base,scope:'table',confirm:true}));
  expect(result.confirmed).toBe('pending');expect(f.calls).toHaveLength(0);
 });
 it('refuses a pre-existing invalid concurrent-build artifact before DDL',async()=>{
  const f=fixture();
  f.setArtifacts([{...first,index_oid:'456',index_name:'people_code_idx_ccnew',
   valid_index:false,ready_index:false}]);
  const args={...base,scope:'index',indexName:first.index_name,confirm:true};
  expect(f.parse(await f.handler(args)).done).toBe(false);
  expect(f.calls).toHaveLength(0);
 });
 it('reports newly-created _ccnew artifacts after an ambiguous write without replay',async()=>{
  const f=fixture({throwOnWrite:true,leaveArtifact:true});
  const args={...base,scope:'index',indexName:first.index_name,confirm:true};
  const output=f.parse(await f.handler(args));
  expect(output.confirmed).toBe('pending');
  expect(output.observationOnly).toBe(true);
  expect(output.observed.indexes.some(x=>x.name==='people_code_idx_ccnew'&&x.valid===false)).toBe(true);
  expect(f.calls).toHaveLength(1);
 });
 it('never retries uncertain DDL and labels readback as observation-only',async()=>{
  const f=fixture({throwOnWrite:true,leaveInvalid:true});
  const result=f.parse(await f.handler({...base,scope:'index',indexName:first.index_name,confirm:true}));
  expect(result).toMatchObject({confirmed:'pending',observationOnly:true,
   observed:{indexes:[{valid:false}]}});
  expect(f.calls).toHaveLength(1);
 });
});
