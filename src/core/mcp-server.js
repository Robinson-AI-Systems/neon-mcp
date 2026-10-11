// Copied and adapted from Robinson-AI-Systems/stripe-mcp src/core/mcp-server.js @ e2f90e8
// Default-deny boundary: read tools, plus two B-2 owner-only internal permission controls.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { requireMcpToken } from './mcp-auth.js';
import { isToolAllowed } from './profiles.js';
import { scrubNeonResult, redactNeonText } from './scrub.js';
import { shapeResult, selectResult } from './result-rules.js';

const displayTool=item=>{
  const {writes:_writes,profiles:_profiles,...publicTool}=item;
  if(item.writes!==false)return publicTool;
  return {...publicTool,inputSchema:{...item.inputSchema,
   properties:{...item.inputSchema?.properties,
    detail:{type:'string',enum:['summary','full'],description:'Choose brief (default) or full details.'},
    fields:{type:'string',maxLength:512,description:'Comma-separated dotted fields to select.'}}}};
};
const allowedTool=(item,connection,env)=>isToolAllowed(item,connection,
  {productionDeployment:env?.VERCEL_ENV==='production'});
function safeMcpResult(result,{args={},tool}={}){
  if(!result || !Array.isArray(result.content))return {isError:true,content:[{type:'text',text:'Invalid tool response'}]};
  return {isError:result.isError===true,content:result.content.map(item=>{
    if(item?.type!=='text')return {type:'text',text:'Non-text output unavailable'};
    let value;
    try { value=JSON.parse(item.text); } catch { return {type:'text',text:redactNeonText(item.text)}; }
    return {type:'text',text:JSON.stringify(shapeResult(tool?.writes===false
      ? selectResult(scrubNeonResult(value),args) : scrubNeonResult(value)))};
  })};
}
export async function dispatchReadOnlyTool({ registry, name, args, connection, db, env=process.env }) {
  const item = registry.tools.find(t => t.name === name);
  if (!allowedTool(item,connection,env)) {
    return {isError:true,content:[{type:'text',text:'Tool unavailable for this connection'}]};
  }
  const handler = registry.handlers[name];
  if (typeof handler !== 'function') {
    return {isError:true,content:[{type:'text',text:'Tool unavailable'}]};
  }
  try { return safeMcpResult(await handler(args || {},{connection,db,env}),{args:args||{},tool:item}); }
  catch {
    return {isError:true,content:[{type:'text',text:'Could not read account details; check server setup'}]};
  }
}
export function createMcpHandler({ db, registry, env = process.env }) {
  return async function mcp(req, res) {
    const connection = await requireMcpToken(req,res,db,env);
    if (!connection) return;
    const server = new Server({name:'robinson-neon-mcp',version:'0.1.0'},
      {capabilities:{tools:{}}});
    server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:registry.tools
      .filter(t=>allowedTool(t,connection,env))
      .map(displayTool)}));
    server.setRequestHandler(CallToolRequestSchema,async request=>
      dispatchReadOnlyTool({registry,name:request.params?.name,args:request.params?.arguments,connection,db,env}));
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
    res.on?.('close',()=>{transport.close();server.close();});
    try {
      await server.connect(transport);
      await transport.handleRequest(req,res,req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({error:'internal_error'});
    }
  };
}
