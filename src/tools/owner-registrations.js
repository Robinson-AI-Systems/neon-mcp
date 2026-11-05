// CAP-6: owner lifecycle for this server's own OAuth client registrations.
// Registrations are server-global owner state: reads and writes are full-profile
// only, summaries never carry the stored secret hash, and delete revokes the
// registration's live connector tokens so nothing it issued keeps working.
import { defineWrite } from '../core/write.js';
import { requestKey } from '../neon/client.js';
const guards=Object.freeze({
  checkProtected:async()=>true, checkProduction:async()=>({allowed:true,production:false}),
  checkApp:async()=>true, checkSpend:async()=>true
});
const clientIdOf=args=>{
  if(typeof args?.clientId!=='string' || !/^[A-Za-z0-9_-]{1,120}$/.test(args.clientId))
    throw new Error('Invalid OAuth client registration selection');
  return args.clientId;
};
const redirectUrisOf=args=>{
  if(args.redirectUris===undefined)return undefined;
  if(!Array.isArray(args.redirectUris) || !args.redirectUris.length ||
    args.redirectUris.some(uri=>{
      if(typeof uri!=='string' || !uri || uri.length>2048)return true;
      try{return !['http:','https:'].includes(new URL(uri).protocol);}
      catch{return true;}
    }))throw new Error('Redirect URIs must be absolute http(s) URLs');
  return args.redirectUris;
};
const label=summary=>summary.clientName?('"'+summary.clientName+'" ('+summary.clientId+')'):summary.clientId;
const update=defineWrite({
  name:'neon_update_oauth_client',productionEffect:'none',
  plan:async(args,ctx)=>{
    const clientId=clientIdOf(args),redirectUris=redirectUrisOf(args);
    if(args.clientName!==undefined && args.clientName!==null &&
      (typeof args.clientName!=='string' || args.clientName.length>200))
      throw new Error('Invalid OAuth client name');
    if(args.clientName===undefined && redirectUris===undefined)
      throw new Error('Nothing to update: name or redirect URIs required');
    const before=await ctx.db.getOAuthClientSummary(clientId);
    if(!before)throw new Error('OAuth client registration not available');
    const changes=[];
    if(args.clientName!==undefined)changes.push('rename to "'+(args.clientName??'')+'"');
    if(redirectUris!==undefined)changes.push('set '+redirectUris.length+' redirect URI(s)');
    return {before,target:'oauth-client:'+clientId,projectId:null,branchId:null,
      summary:'Update OAuth client registration '+label(before)+': '+changes.join('; ')+
        '; issued credentials are not touched'};
  },
  apply:async(args,ctx)=>({confirmed:await ctx.db.updateOAuthClient({
    clientId:clientIdOf(args),clientName:args.clientName,
    redirectUris:redirectUrisOf(args)})}),
  readAfter:async(args,ctx)=>ctx.db.getOAuthClientSummary(clientIdOf(args)),
  verify:async(_before,after,args)=>Boolean(after) &&
    (args.clientName===undefined || after.clientName===args.clientName) &&
    (args.redirectUris===undefined ||
      JSON.stringify(after.redirectUris)===JSON.stringify(args.redirectUris))
});
const remove=defineWrite({
  name:'neon_delete_oauth_client',access:true,destructive:true,productionEffect:'none',
  plan:async(args,ctx)=>{
    const clientId=clientIdOf(args);
    const before=await ctx.db.getOAuthClientSummary(clientId);
    if(!before)throw new Error('OAuth client registration not available');
    return {before,target:'oauth-client:'+clientId,projectId:null,branchId:null,
      summary:'Delete OAuth client registration '+label(before)+' and revoke its '+
        before.tokens.live+' live token(s); '+before.pendingCodes+
        ' pending authorization code(s) are removed; this cannot be undone'};
  },
  apply:async(args,ctx)=>{
    const result=await ctx.db.deleteOAuthClient(clientIdOf(args));
    if(!result)return {confirmed:false};
    ctx.oauthClientDeletion=result;
    return {confirmed:true,operations:[]};
  },
  readAfter:async(args,ctx)=>ctx.db.getOAuthClientSummary(clientIdOf(args)),
  verify:async(_before,after)=>after===null
});
const clientIdSchema={type:'string',minLength:1,maxLength:120};
export const tools=[
  {name:'neon_list_oauth_clients',description:'List this server’s OAuth client registrations with safe summaries and live token counts, never secrets.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},writes:false,profiles:['full']},
  {name:'neon_get_oauth_client',description:'Show one OAuth client registration’s safe summary and live token count, never secret material.',
    inputSchema:{type:'object',properties:{clientId:clientIdSchema},required:['clientId'],
      additionalProperties:false},writes:false,profiles:['full']},
  {...update.tool,profiles:['full'],
    description:'Preview and update one OAuth client registration’s name or redirect URIs; issued credentials stay untouched.',
    inputSchema:{type:'object',properties:{...update.tool.inputSchema.properties,
      clientId:clientIdSchema,clientName:{type:'string',maxLength:200},
      redirectUris:{type:'array',minItems:1,items:{type:'string',maxLength:2048}}},
      required:['clientId'],additionalProperties:false}},
  {...remove.tool,profiles:['full'],
    description:'Preview and delete one OAuth client registration, revoking its live tokens so they stop working.',
    inputSchema:{type:'object',properties:{...remove.tool.inputSchema.properties,
      clientId:clientIdSchema},required:['clientId'],additionalProperties:false}}
];
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const internalContext=({db,connection,env})=>({
  db,connection,env,deploymentEnv:env?.VERCEL_ENV,guards,
  connectionId:connection?.clientId??connection?.client_id??null,
  writeKey:(name,args)=>requestKey({neonOrg:connection?.neonOrg??connection?.neon_org},name,args)
});
export const handlers={
  async neon_list_oauth_clients(_args,{db}) {
    return result({clients:await db.listOAuthClients()});
  },
  async neon_get_oauth_client(args,{db}) {
    let clientId;
    try{clientId=clientIdOf(args);}catch{
      return {isError:true,content:[{type:'text',
        text:'Invalid OAuth client registration selection.'}]};
    }
    const summary=await db.getOAuthClientSummary(clientId);
    if(!summary)return {isError:true,content:[{type:'text',
      text:'OAuth client registration not available.'}]};
    return result({client:summary});
  },
  neon_update_oauth_client:(args,context)=>update.handler(args,internalContext(context)),
  neon_delete_oauth_client:(args,context)=>remove.handler(args,internalContext(context))
};
