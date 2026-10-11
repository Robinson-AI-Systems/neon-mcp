// Copied and adapted from Robinson-AI-Systems/stripe-mcp src/core/mcp-server.js @ e2f90e8
// Default-deny boundary: read tools, plus two B-2 owner-only internal permission controls.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { requireMcpToken } from './mcp-auth.js';

const INTERNAL_CONTROLS=new Set(['neon_enable_production','neon_disable_production']);
function allowedTool(item,connection,env){
  if(!item?.profiles?.includes(connection?.profile))return false;
  if(item.writes===false)return true;
  return item.writes===true && INTERNAL_CONTROLS.has(item.name) &&
    connection.profile==='full' && env?.VERCEL_ENV==='production';
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
  try { return await handler(args || {},{connection,db,env}); }
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
      .map(({writes:_writes,profiles:_profiles,...publicTool})=>publicTool)}));
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
