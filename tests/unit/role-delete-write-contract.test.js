import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {createMcpHandler,dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {handlers as metaHandlers,tools as metaTools} from '../../src/tools/meta.js';
import {tools} from '../../src/tools/role-delete.js';
import {fixture,a,json} from '../../test/helpers/role-retirement-fixture.js';
import {runWriteContract} from '../../test/helpers/write-contract.js';
import {IDS} from '../../test/helpers/neon-fixtures.js';
const name='neon_role_delete';
const input={...a,acknowledgeConnectionInterruption:true,confirmRoleName:a.roleName};
function makeFixture(opts={},door){
 const f=fixture({allowed:!opts.blocked&&!opts.appOwned&&opts.spendCents!==2600,
  production:opts.production===true,afterAbsent:opts.verify!==false});
 const registry={tools:[...tools,...metaTools],handlers:{...metaHandlers,[name]:f.handler}};
 let server,consent,consentMode;
 async function throughDoor(args){
  if(door!=='https'){
   f.arrangeReadback(args);
   return dispatchReadOnlyTool({registry,name:door==='delegated'?'neon_call':name,
    args:door==='delegated'?{name,args}:args,connection:f.c.connection,db:f.c.db,
    env:{VERCEL_ENV:'production'}});
  }
  if(!server){
   const wire=createMcpHandler({registry,db:{...f.c.db,
    listNeonOrgs:async()=>[{id:IDS.org,production_enabled:true}],
    getAccessToken:async()=>({profile:f.c.connection.profile,listing:'catalog',
     mode:f.c.connection.mode,neon_org:IDS.org,project_scope:IDS.project,client_id:'client-fake-1'})},
    env:{VERCEL_ENV:'production',PUBLIC_BASE_URL:'https://fake-owner.invalid'}});
   server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    req.body=JSON.parse(Buffer.concat(chunks).toString('utf8'));await wire(req,res);
   });
   await new Promise(r=>server.listen(0,'127.0.0.1',r));
  }
  f.arrangeReadback(args);
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/mcp',{
   method:'POST',headers:{authorization:'Bearer '+'f'.repeat(40),
    'content-type':'application/json',accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  const body=await response.text(),line=body.split('\n').find(x=>x.startsWith('data: '));
  const out=JSON.parse(line?line.slice(6):body);return out.result??out;
 }
 const handler=async(args)=>{
  // The generic B-1 harness starts with raw confirms on some fixtures. Prepare
  // actual recorded consent through the SAME door, never inject a fake absence.
  if(args.confirm===true&&!args.retirementConsent){
   if(!consent||consentMode!==f.c.connection.mode){
    const p=json(await throughDoor({...args,confirm:false,dryRun:true}));
    consent=p.retirementConsent;consentMode=f.c.connection.mode;
   }
   args={...args,retirementConsent:consent};
  }
  const out=await throughDoor(args),parsed=json(out);
  if(parsed.retirementConsent){consent=parsed.retirementConsent;consentMode=f.c.connection.mode;}
  return out;
 };
 return {ctx:f.c,log:f.log,tool:tools[0],handler,parse:json,
  get calls(){return f.fake.calls.filter(x=>x.method==='DELETE');},
  close:async()=>{f.fake.assertClean();if(server)await new Promise(r=>server.close(r));}};
}
describe('D-4 retirement through every service door',()=>{
 for(const door of ['direct','delegated','https'])it('passes the nine-write contract through '+door,async()=>{
  const fixtures=[];
  try{
   await runWriteContract(opts=>{const f=makeFixture(opts,door);fixtures.push(f);return f;},
    {input,nonBillable:true});
  }finally{for(const f of fixtures)await f.close();}
 });
 it('does not grant unknown pooler visibility through tool metadata',()=>{
  expect(tools[0].profiles).toEqual(['full']);
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
});
