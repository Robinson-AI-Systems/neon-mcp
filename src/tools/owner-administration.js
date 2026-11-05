// B-8b: revoke local OAuth grants only; never mutate Neon API or enable production.
// CAP-8 companion: the purge hard-deletes only rows that are already revoked
// (token rows also once expired); a live row is never purgeable.
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
const purge=defineWrite({
  name:'neon_purge_revoked_records',destructive:true,productionEffect:'none',
  plan:async(_args,ctx)=>{
    const before=await ctx.db.countPurgeableStoredRecords();
    return {before,target:'server-store:revoked-rows',
      summary:'Permanently delete '+before.neonKeys+' revoked stored key row(s) and '+
        before.oauthTokens+' revoked or expired token row(s); live rows are never touched',
      projectId:null,branchId:null};
  },
  apply:async(_args,ctx)=>{
    const result=await ctx.db.purgeRevokedStoredRecords();
    ctx.purgedStoredRecords=result;
    return {confirmed:true,operations:[]};
  },
  readAfter:async(_args,ctx)=>ctx.db.countPurgeableStoredRecords(),
  verify:async(_before,after)=>after.neonKeys===0 && after.oauthTokens===0
});
// CAP-7: unenroll the connection's own organization. The summary names the
// organization by ID (labels may be email-shaped and fail the safe-summary
// scrub); counts enumerate the full cascade before any confirm.
const unenroll=defineWrite({
  name:'neon_unenroll_organization',access:true,destructive:true,
  productionEffect:'none',key:'org',
  plan:async(_args,ctx)=>{
    const orgId=ctx.connection?.neonOrg ?? ctx.connection?.neon_org;
    if(typeof orgId!=='string'||!orgId)throw new Error('Invalid organization selection');
    const before=await ctx.db.getNeonOrgRemovalPreview(orgId);
    if(!before)throw new Error('Organization not available');
    return {before,target:'organization:'+orgId,projectId:null,branchId:null,
      summary:'Unenroll organization '+orgId+' from this server: revoke '+
        before.liveKeys+' live stored key(s) of '+before.storedKeys+' stored, revoke '+
        before.liveTokens+' live connection token(s) including '+before.livePasses+
        ' pass(es), remove '+before.pendingCodes+' pending sign-in code(s), then delete '+
        'the enrollment'+(before.org.production_enabled?
          '; PRODUCTION ACCESS IS ENABLED for this organization':'')+
        '; re-enrollment stays possible from the setup page'};
  },
  apply:async(_args,ctx)=>{
    const orgId=ctx.connection?.neonOrg ?? ctx.connection?.neon_org;
    const result=await ctx.db.deleteNeonOrg(orgId);
    if(!result)return {confirmed:false};
    ctx.orgRemoval=result;
    return {confirmed:true,operations:[]};
  },
  readAfter:async(_args,ctx)=>
    ctx.db.getNeonOrg(ctx.connection?.neonOrg ?? ctx.connection?.neon_org),
  verify:async(_before,after)=>after===null
});
export const tools=[{...revoke.tool,profiles:['full'],
  description:'Preview and revoke one client’s grants in this organization immediately.',
  inputSchema:{type:'object',properties:{...revoke.tool.inputSchema.properties,
    clientId:{type:'string',minLength:1,maxLength:120}},required:['clientId'],additionalProperties:false}},
  {...purge.tool,profiles:['full'],
  description:'Preview and permanently delete revoked stored key rows and revoked or expired token rows.',
  inputSchema:{type:'object',properties:{...purge.tool.inputSchema.properties},
    additionalProperties:false}},
  {...unenroll.tool,profiles:['full'],
  description:'Preview and unenroll this connection’s organization, revoking its stored keys and live tokens.',
  inputSchema:{type:'object',properties:{...unenroll.tool.inputSchema.properties},
    additionalProperties:false}}];
const internalContext=({db,connection,env})=>({
  db,connection,env,deploymentEnv:env?.VERCEL_ENV,guards,
  connectionId:connection?.clientId??connection?.client_id??null,
  writeKey:(name,args)=>requestKey({neonOrg:connection?.neonOrg??connection?.neon_org},name,args)
});
export const handlers={
  neon_revoke_connection:(args,context)=>revoke.handler(args,internalContext(context)),
  neon_purge_revoked_records:(args,context)=>purge.handler(args,internalContext(context)),
  neon_unenroll_organization:(args,context)=>unenroll.handler(args,internalContext(context))
};
