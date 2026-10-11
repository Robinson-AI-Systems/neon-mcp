// C-2: all discovery and dispatch use the authenticated connection-scoped registry.
import { isToolAllowed } from '../core/profiles.js';
import { publicToolMetadata, dispatchReadOnlyTool } from '../core/mcp-server.js';
const profiles=['read_only','everyday','full'];
const schema=properties=>({type:'object',properties,additionalProperties:false});
const text=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const unavailable=()=>({isError:true,content:[{type:'text',text:'Tool unavailable for this connection'}]});
const authorized=(t,ctx)=>isToolAllowed(t,ctx.connection,
 {productionDeployment:ctx.env?.VERCEL_ENV==='production'});
export const tools=[
 {name:'neon_search_tools',description:'Search available tools by keywords, area and audience; paginate brief safe descriptions.',
  writes:false,profiles,audience:['builder','owner','operator'],area:'discovery',
  inputSchema:schema({query:{type:'string',maxLength:160},area:{type:'string',maxLength:40},
   audience:{type:'string',enum:['builder','owner','operator']},
   limit:{type:'integer',minimum:1,maximum:20},offset:{type:'integer',minimum:0,maximum:10000}})},
 {name:'neon_call',description:'Call an allowed tool by name through its normal authenticated safety and result guards.',
  writes:false,profiles,audience:['builder','owner','operator'],area:'discovery',
  inputSchema:schema({name:{type:'string',pattern:'^neon_[a-z0-9_]+$',maxLength:90},
   args:{type:'object'}})},
 {name:'neon_batch',description:'Run at most ten authorized read-only tools in order; reject the entire batch if any write appears.',
  writes:false,profiles,audience:['builder','operator'],area:'discovery',
  inputSchema:schema({calls:{type:'array',minItems:1,maxItems:10,items:{type:'object',
   properties:{name:{type:'string',pattern:'^neon_[a-z0-9_]+$'},args:{type:'object'}},
   required:['name'],additionalProperties:false}}})},
 {name:'neon_describe_tool',description:'Describe a tool available to this connection, including its input schema and safety hints.',
  writes:false,profiles,audience:['builder','owner','operator'],area:'discovery',
  inputSchema:schema({name:{type:'string',pattern:'^neon_[a-z0-9_]+$',maxLength:90}})}
];
export const handlers={
 async neon_batch(args,ctx){
  if(!Array.isArray(args.calls)||args.calls.length<1||args.calls.length>10)return unavailable();
  const calls=args.calls;
  // Refuse the complete batch before running any call if one call could be a write.
  if(calls.some(c=>!c||typeof c.name!=='string'||!c.name.startsWith('neon_')||
    ['neon_call','neon_batch'].includes(c.name)||
    (c.args!==undefined&&(!c.args||typeof c.args!=='object'||Array.isArray(c.args)))||
    !ctx.registry.tools.some(t=>t.name===c.name&&t.writes===false&&authorized(t,ctx))))
   return unavailable();
  const results=[];
  for(const c of calls){
   const response=await dispatchReadOnlyTool({registry:ctx.registry,name:c.name,args:c.args||{},
    connection:ctx.connection,db:ctx.db,env:ctx.env});
   results.push({name:c.name,response});
  }
  return text({count:results.length,results});
 },
 async neon_call(args,ctx){
  if(typeof args.name!=='string'||!args.name.startsWith('neon_')||
    ['neon_call','neon_batch'].includes(args.name)||
    (args.args!==undefined&&(!args.args||typeof args.args!=='object'||Array.isArray(args.args))))
   return unavailable();
  return dispatchReadOnlyTool({registry:ctx.registry,name:args.name,args:args.args||{},
   connection:ctx.connection,db:ctx.db,env:ctx.env});
 },
 async neon_search_tools(args,ctx){
  const query=String(args.query??'').trim().toLowerCase();
  const audience=args.audience,area=args.area?.trim().toLowerCase();
  const available=ctx.registry.tools.filter(t=>authorized(t,ctx)&&
   (!area||t.area?.toLowerCase()===area)&&
   (!audience||!t.audience||t.audience.includes(audience))&&
   (!query||`${t.name} ${t.description} ${t.area||''}`.toLowerCase().includes(query)));
  const offset=args.offset??0,limit=args.limit??10;
  return text({total:available.length,offset,limit,next:offset+limit<available.length?offset+limit:null,
   tools:available.slice(offset,offset+limit).map(t=>({
    name:t.name,description:t.description,area:t.area||'server',
    readOnly:t.writes===false,destructive:t.destructive===true,
    requiresConfirmation:t.writes===true
   }))});
 },
 async neon_describe_tool(args,ctx){
  const item=ctx.registry.tools.find(t=>t.name===args.name);
  if(!authorized(item,ctx))return unavailable();
  return text({tool:publicToolMetadata(item)});
 }
};
