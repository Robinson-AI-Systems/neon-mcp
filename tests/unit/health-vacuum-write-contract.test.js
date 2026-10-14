import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {createMcpHandler,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {createVacuumHandlers,VACUUM_STATS_SQL} from '../../src/tools/health-vacuum.js';
import {handlers as metaHandlers,tools as metaTools} from '../../src/tools/meta.js';
import {runWriteContract,makeContractFixture} from '../../test/helpers/write-contract.js';
const args={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',schemaName:'public',tableName:'people'};
const row={relation_oid:'123',table_name:'people',relation_kind:'r',rls_enabled:false,
 total_bytes:'16384',estimated_dead_rows:'3',manual_vacuum_count:'0',
 manual_analyze_count:'0',last_vacuum:null,last_analyze:null};
function make(opts={},door='direct'){
 const f=makeContractFixture(opts),name='neon_health_vacuum_analyze';
 let current={...row},server;
 f.ctx.connection={neonOrg:'org-fake',profile:'full',mode:'preview'};
 f.ctx.guards.checkSpend=async()=>opts.spendCents!==2600;
 f.ctx.getBranch=async()=>({id:args.branchId,default:opts.production===true});
 const impl=createVacuumHandlers({contextFor:async()=>f.ctx,
  verifyTarget:async a=>({pid:a.projectId,bid:a.branchId,endpointId:a.endpointId,
   database:a.databaseName,role:a.roleName,endpoint:{host:'direct.fake'}}),
  query:async({text})=>text===VACUUM_STATS_SQL?
   {done:true,truncated:false,rowCount:1,rows:[current]}:
   {done:false,truncated:true,rowCount:0,rows:[]},
  mutate:async()=>{f.calls.push('vacuum');
   if(opts.throwOnWrite)throw Error('ambiguous maintenance');
   if(opts.verify===false)current={...current,relation_oid:'456'};
   else current={...current,manual_vacuum_count:'1',manual_analyze_count:'1'};
   return {issued:true};
  }});
 const registry={tools:[...impl.tools,...metaTools],
  handlers:{...impl.handlers,...metaHandlers}};
 async function invoke(input){
  if(door!=='https')return dispatchReadOnlyTool({registry,
   name:door==='delegated'?'neon_call':name,
   args:door==='delegated'?{name,args:input}:input,
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
   await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  }
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/mcp',{
   method:'POST',headers:{authorization:'Bearer '+'f'.repeat(40),
    'content-type':'application/json',accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name,arguments:input}})});
  const body=await response.text();
  const line=body.split('\n').find(x=>x.startsWith('data: '));
  const parsed=JSON.parse(line?line.slice(6):body);return parsed.result??parsed;
 }
 return {...f,handler:invoke,setRow:x=>{current=x;},
  close:async()=>{if(server)await new Promise(ok=>server.close(ok));}};
}
describe('D-6 owner-confirmed development VACUUM ANALYZE',()=>{
 for(const door of ['direct','delegated','https'])
  it('nine guarded B-1 cases via '+door,async()=>{
   const opened=[];
   try{await runWriteContract(opts=>{const f=make(opts,door);opened.push(f);return f;},
    {input:args,nonBillable:true,productionAllowed:false});}
   finally{for(const f of opened)await f.close();}
  });
 it('refuses forged or incomplete table catalog before mutation',async()=>{
  for(const altered of [{relation_oid:'bogus'},{relation_kind:'p'},
    {table_name:'other'},{manual_vacuum_count:null}]){
   const f=make();f.setRow({...row,...altered});
   expect(f.parse(await f.handler({...args,confirm:true})).done).toBe(false);
   expect(f.calls).toHaveLength(0);
  }
 });
 it('rejects verified protected production target',async()=>{
  const f=make();f.ctx.getBranch=async()=>({id:args.branchId,protected:true});
  expect(f.parse(await f.handler({...args,confirm:true})).done).toBe(false);
  expect(f.calls).toHaveLength(0);
 });
 it('does not replay an ambiguous VACUUM and keeps its audit pending',async()=>{
  const f=make({throwOnWrite:true});
  const result=f.parse(await f.handler({...args,confirm:true}));
  expect(result.confirmed).toBe('pending');
  expect(f.calls).toHaveLength(1);
  expect(f.parse(await f.handler({...args,confirm:true})).confirmed).toBe('pending');
  expect(f.calls).toHaveLength(1);
 });
});
