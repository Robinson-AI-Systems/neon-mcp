// Copied and adapted from Robinson-AI-Systems/stripe-mcp src/core/mcp-server.js @ e2f90e8
// Default-deny boundary: read tools, plus two B-2 owner-only internal permission controls.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { requireMcpToken } from './mcp-auth.js';
import { isToolAllowed } from './profiles.js';
import { scrubNeonResult, redactNeonText } from './scrub.js';
import { shapeResult, selectResult } from './result-rules.js';
import {bufferOversizeResult} from './result-store.js';

// C-1 annotations are derived from trusted tool metadata, not tool-supplied arguments.
export const publicToolMetadata=item=>{
 const {writes:_writes,profiles:_profiles,...publicTool}=item;
 const inputSchema=item.writes===false?{...item.inputSchema,
  properties:{...item.inputSchema?.properties,
   detail:{type:'string',enum:['summary','full'],description:'Choose brief (default) or full details.'},
   fields:{type:'string',maxLength:512,description:'Comma-separated dotted fields to select.'}}}
  :item.inputSchema;
 return {...publicTool,inputSchema,annotations:{
   readOnlyHint:item.writes===false,
   destructiveHint:item.destructive===true,
   idempotentHint:item.writes===false || item.writeContract==='defineWrite-v1',
   openWorldHint:item.productionEffect==='write'
 }};
};
const allowedTool=(item,connection,env)=>isToolAllowed(item,connection,
  {productionDeployment:env?.VERCEL_ENV==='production'});
const compactCore=new Set(['neon_search_tools','neon_describe_tool','neon_call',
 'neon_batch','neon_get_result','neon_whoami','neon_api_search']);
export function listVisibleToolMetadata({registry,connection,env,listing}) {
 const mode=['catalog','compact'].includes(listing)?listing:
  connection?.listing==='catalog'?'catalog':'compact';
 return registry.tools.filter(t=>allowedTool(t,connection,env) &&
  (mode==='catalog'||compactCore.has(t.name)||
   (t.name.startsWith('neon_workflow_')&&t.writes===false)))
  .map(publicToolMetadata);
}
async function safeMcpResult(result,{args={},tool,db,connection}={}){
 if(!result||!Array.isArray(result.content))return {isError:true,content:[{type:'text',text:'Invalid tool response'}]};
 const content=[];
 for(const item of result.content){
  if(item?.type!=='text'){content.push({type:'text',text:'Non-text output unavailable'});continue;}
  let value;
  try{value=JSON.parse(item.text);}
  catch{
   const safeText=redactNeonText(item.text);
   const buffered=await bufferOversizeResult({db,connection,toolName:tool?.name,value:{text:safeText}});
   content.push({type:'text',text:JSON.stringify(buffered.value)});
   continue;
  }
  const shaped=shapeResult(tool?.writes===false
   ?selectResult(scrubNeonResult(value),args):scrubNeonResult(value));
  const buffered=await bufferOversizeResult({db,connection,toolName:tool?.name,value:shaped});
  content.push({type:'text',text:JSON.stringify(buffered.value)});
 }
 const isError=result.isError===true;
 if(!isError&&tool?.outputSchema&&content.length===1){
  try{
   const parsed=JSON.parse(content[0].text);
   if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))
     return {isError:false,content,structuredContent:parsed};
  }catch{/* Never emit malformed structured content. */}
 }
 return {isError,content};
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
  try { return safeMcpResult(await handler(args || {},{connection,db,env,registry}),{args:args||{},tool:item,db,connection}); }
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
    server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:listVisibleToolMetadata({
      registry,connection,env,listing:req.query?.listing})}));
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
