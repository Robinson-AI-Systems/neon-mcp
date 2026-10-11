// B-8b: revoke local OAuth grants only; never mutate Neon API or enable production.
import { defineWrite } from '../core/write.js';
import { requestKey } from '../neon/client.js';
const guards=Object.freeze({
  checkProtected:async()=>true, checkProduction:async()=>({allowed:true,production:false}),
  checkApp:async()=>true, checkSpend:async()=>true
});
const selected=(ctx,args)=>{
  const orgId=ctx.connection?.neonOrg ?? ctx.connection?.neon_org;
  if(typeof orgId!=='string'||!orgId || typeof args.clientId!=='string' ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(args.clientId))throw new Error('Invalid connection selection');
  return {orgId,clientId:args.clientId};
};
const revoke=defineWrite({
  name:'neon_revoke_connection',access:true,productionEffect:'none',
  plan:async(args,ctx)=>{
    const {orgId,clientId}=selected(ctx,args);
    const org=await ctx.db.getNeonOrg(orgId);
    const before=org && await ctx.db.getActiveScopedConnection({orgId,clientId});
    if(!before)throw new Error('Connection not available');
    return {before,target:'access-control:'+orgId+':'+clientId,
      summary:'Revoke every active connector or pass grant for client '+clientId,
      projectId:null,branchId:null};
  },
  apply:async(args,ctx)=>({confirmed:await ctx.db.revokeScopedConnection(selected(ctx,args))}),
  readAfter:async(args,ctx)=>ctx.db.getActiveScopedConnection(selected(ctx,args)),
  verify:async(_before,after)=>after===null
});
export const tools=[{...revoke.tool,profiles:['full'],
  description:'Preview and revoke one client’s grants in this organization immediately.',
  inputSchema:{type:'object',properties:{...revoke.tool.inputSchema.properties,
    clientId:{type:'string',minLength:1,maxLength:120}},required:['clientId'],additionalProperties:false}}];
const internalContext=({db,connection,env})=>({
  db,connection,env,deploymentEnv:env?.VERCEL_ENV,guards,
  connectionId:connection?.clientId??connection?.client_id??null,
  writeKey:(name,args)=>requestKey({neonOrg:connection?.neonOrg??connection?.neon_org},name,args)
});
export const handlers={
  neon_revoke_connection:(args,context)=>revoke.handler(args,internalContext(context))
};
