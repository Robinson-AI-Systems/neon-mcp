import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {createMcpHandler,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {createExtensionWriteHandlers} from '../../src/tools/schema-extension-write.js';
import {handlers as metaHandlers,tools as metaTools} from '../../src/tools/meta.js';
import {runWriteContract,makeContractFixture} from '../../test/helpers/write-contract.js';
const name='neon_schema_enable_extension';
const input={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',extensionName:'hstore',update:false};
function fixture(opts={},door='direct'){
 const f=makeContractFixture(opts);let installed=null,server;
 f.ctx.connection={neonOrg:'org-fake',profile:'full',mode:'preview'};
 f.ctx.getBranch=async()=>({id:input.branchId,default:opts.production===true});
 f.ctx.guards.checkSpend=async()=>opts.spendCents!==2600;
 const original=f.ctx.guards.checkProduction;
 f.ctx.guards.checkProduction=async(...args)=>opts.production
  ?{allowed:false,production:true}:original(...args);
 const impl=createExtensionWriteHandlers({contextFor:async()=>f.ctx,
  verifyTarget:async a=>({pid:a.projectId,bid:a.branchId,endpointId:a.endpointId,
   database:a.databaseName,role:a.roleName,endpoint:{host:'direct.invalid'}}),
  query:async()=>({done:true,truncated:false,rowCount:1,rows:[{
   extension_name:'hstore',default_version:'1.8',installed_version:installed}]}),
  mutate:async()=>{f.calls.push('ddl');if(opts.verify!==false)installed='1.8';return {issued:true};}});
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
   server=createServer(async(req,res)=>{res.status=n=>{res.statusCode=n;return res;};res.send=x=>res.end(JSON.stringify(x));const chunks=[];for await(const chunk of req)chunks.push(chunk);
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
 return {...f,tool:impl.tools[0],handler:invoke,
  close:async()=>{if(server)await new Promise(r=>server.close(r));}};
}
describe('development extension all-door write contract',()=>{
 for(const door of ['direct','delegated','https'])it('nine cases through '+door,async()=>{
  const instances=[];
  try{await runWriteContract(opts=>{const f=fixture(opts,door);instances.push(f);return f;},
   {input,nonBillable:true,productionAllowed:false});}
  finally{for(const f of instances)await f.close();}
 });
 it('rejects a newly protected branch immediately before mutation',async()=>{
  const f=fixture();let reads=0;
  f.ctx.getBranch=async()=>({id:input.branchId,protected:++reads>0});
  const out=f.parse(await f.handler({...input,confirm:true},f.ctx));
  expect(out.confirmed).toBe('pending');expect(f.calls).toHaveLength(0);
 });
});
