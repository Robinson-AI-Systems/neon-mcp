// D-4 real role write-contract: all nine cases through direct MCP,
// delegated neon_call and the HTTPS MCP JSON-RPC transport.
import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {createMcpHandler,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,role,database,devEndpoint,responses} from '../../test/helpers/neon-fixtures.js';
import {createReadOnlyRoleHandlers,tools} from '../../src/tools/role-read-only.js';
import {handlers as metaHandlers,tools as metaTools} from '../../src/tools/meta.js';
import {runWriteContract} from '../../test/helpers/write-contract.js';
import {isToolAllowed} from '../../src/core/profiles.js';
const name='neon_role_create_read_only';
const input={branchId:IDS.dev,name:'scoped_reader',ownerName:'neondb_owner',
 databaseName:'neondb',endpointId:IDS.devEndpoint,schemas:['public']};
const parse=x=>JSON.parse(x.content[0].text);
function realFixture(opts={},door='direct'){
 const {production=false,blocked=false,appOwned=false,verify=true,spendCents=null}=opts;
 const fake=makeFakeNeon(),log=[],stored=[];
 const client=makeNeonClient({key:'napi_FAKE_D4_contract',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
 fake.when('getProjectBranchDatabase').resolves({database:database(IDS.dev)});
 fake.when('getProjectEndpoint').resolves({endpoint:devEndpoint({current_state:'active'})});
 fake.when('listProjectBranchRoles').resolves({roles:[role(IDS.dev)]});
 const owner=role(IDS.dev),created=role(IDS.dev,{
  name:input.name,...(!verify?{protected:true}:{})});
 const sequence=Object.keys(opts).length===0
  ?[owner,owner,owner,owner,created,owner]
  :production?[owner,owner,owner,created]:[owner,owner,created];
 const rs=fake.when('getProjectBranchRole');
 for(const item of sequence)rs.resolves({role:item});
 fake.when('createProjectBranchRole').resolves({role:role(IDS.dev,{
  name:input.name,password:'npg_FAKE_one_time_password'}),operations:[]});
 const db={
  async recordWritePreview(x){log.push({kind:'preview',...x})},
  async reserveWrite(x){
   const previous=log.find(y=>y.kind==='reserved'&&y.requestKey===x.requestKey);
   if(previous)return {created:false,existing:{neon_org:previous.orgId,
    tool:previous.tool,project_id:previous.projectId,
    branch_id:previous.branchId,target:previous.target,confirmed:previous.confirmed}};
   log.push({kind:'reserved',...x,confirmed:'pending'});
   return {created:true,id:log.length};
  },
  async completeWrite(x){Object.assign(log[x.id-1],x);return true},
  async saveOneTimeSecret(x){stored.push(x);return true},
  async consumeSecretRequest(){return null}
 };
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  profile:'full',mode:'preview'},db,
  clientFor:async()=>client,writeKey:()=> 'rmcp_role_contract_abcdef123456',
  deploymentEnv:'production',env:{PUBLIC_BASE_URL:'https://fake-owner.invalid',
   TOKEN_ENCRYPTION_KEY:'A'.repeat(43)},
  guards:{checkProtected:async()=>!blocked,checkApp:async()=>!appOwned,
   checkProduction:async()=>({allowed:true,production}),
   checkSpend:async()=>spendCents!==2600}};
 const grant=async a=>({verified:true,role:a.name,owner:a.ownerName,
  schemas:a.schemas,futureTablesForOwnerVerified:true});
 // The production admission function is separately tested in sql-run.test.js:
 // this fake tests B-1 dispatch with no actual SQL/provider network.
 const handlers=createReadOnlyRoleHandlers({
  contextFor:async()=>ctx,grant,admission:async()=>true});
 const registry={tools:[...tools,...metaTools],
  handlers:{...handlers,...metaHandlers}};
 let server=null;
 async function http(args){
  if(!server){
   const transport=createMcpHandler({registry,db:{...db,
    getAccessToken:async()=>({profile:ctx.connection.profile,listing:'catalog',
     mode:ctx.connection.mode,neon_org:IDS.org,
     project_scope:IDS.project,client_id:'fake-client'})},
    env:{VERCEL_ENV:'production',PUBLIC_BASE_URL:'https://fake-owner.invalid'}});
   server=createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);
    try{req.body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      await transport(req,res);}
    catch{if(!res.headersSent){res.statusCode=500;res.end();}}
   });
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  }
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/mcp',{
   method:'POST',headers:{authorization:'Bearer '+'f'.repeat(40),
    'content-type':'application/json',
    accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name,arguments:args}})});
  const payload=await response.text();
  const line=payload.split('\n').find(x=>x.startsWith('data: '));
  if(!payload.trim())throw Error('Empty MCP transport reply '+response.status);
  const decoded=JSON.parse(line?line.slice(6):payload);
  return decoded.result??decoded;
 }
 const invoke=async(args)=>door==='https'?http(args):dispatchReadOnlyTool({
  registry,name:door==='delegated'?'neon_call':name,
  args:door==='delegated'?{name,args}:args,
  connection:ctx.connection,db,env:{VERCEL_ENV:'production'}});
 return {ctx,log,stored,tool:tools[0],handler:invoke,parse,
  get calls(){return fake.calls.filter(x=>x.method==='POST');},
  async close(){fake.assertClean();
   if(server)await new Promise(resolve=>server.close(resolve));}};
}
describe('D-4 scoped role all-door guarded write contract',()=>{
 for(const door of ['direct','delegated','https']){
  it('passes shared nine-case role write contract through '+door,async()=>{
   const instances=[];
   const make=opts=>{const f=realFixture(opts,door);instances.push(f);return f};
   await runWriteContract(make,{input,nonBillable:true});
   for(const f of instances)await f.close();
  });
 }
 it('excludes role password writes from everyday, read_only and preview deployments',()=>{
  for(const profile of ['everyday','read_only'])
   expect(isToolAllowed(tools[0],{profile},{productionDeployment:true})).toBe(false);
  expect(isToolAllowed(tools[0],{profile:'full'},{productionDeployment:false}))
   .toBe(false);
 });
});
