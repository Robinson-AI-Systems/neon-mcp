// Two *internal permission controls*, not raw Neon API tools. Final enable requires
// the owner to re-enter their passphrase at /api/neon/setup within 10 minutes.
import { defineWrite } from '../core/write.js';
import { requestKey } from '../neon/client.js';
import { activationEligible } from '../core/owner-activation.js';

const target = ctx => ctx.connection?.neonOrg;
const planFor = async (ctx, verb) => {
  const orgId=target(ctx);
  const org=orgId && await ctx.db.getNeonOrg(orgId);
  if (!org) throw new Error('Organization not configured');
  return { before:org, target:'access-control:'+orgId, summary:verb,
    projectId:null, branchId:null };
};
// Every B-1 guard is still supplied, but no external Neon target is changed:
// these controls only store owner approval intent or turn access OFF.
const ownerGuards = Object.freeze({
  checkProtected: async()=>true, checkApp: async()=>true,
  checkProduction: async()=>({allowed:true,production:false}),
  checkSpend: async()=>true
});
const enabled=defineWrite({
  name:'neon_enable_production', access:true, productionEffect:'none',
  plan:async(_args,ctx)=>{
    if(!await activationEligible({env:ctx.env,db:ctx.db,orgId:target(ctx)}))
      throw new Error('Production not approved for activation');
    return planFor(ctx,'Request production access for this organization; not activated until owner passphrase approval.');
  },
  apply:async(_args,ctx)=>{
    if(!await activationEligible({env:ctx.env,db:ctx.db,orgId:target(ctx)}))
      return {confirmed:false};
    return {confirmed:await ctx.db.requestProductionEnable({orgId:target(ctx)})};
  },
  readAfter:async(_args,ctx)=>ctx.db.getPendingProductionEnable(target(ctx)),
  verify:async(_before,after)=>!!after?.expires_at
});
const disabled=defineWrite({
  name:'neon_disable_production', access:true, productionEffect:'none',
  plan:async(_args,ctx)=>planFor(ctx,'Immediately disable production access and cancel pending approval.'),
  apply:async(_args,ctx)=>({confirmed:await ctx.db.disableProduction({orgId:target(ctx)})}),
  readAfter:async(_args,ctx)=>ctx.db.getNeonOrg(target(ctx)),
  verify:async(_before,after)=>after?.production_enabled===false
});
export const tools=[
  {...enabled.tool,profiles:['full'],description:'Ask owner to enable production after separate passphrase confirmation.'},
  {...disabled.tool,profiles:['full'],description:'Immediately disable production access and cancel pending owner approval.'}
];
const internalContext=({connection,db,env})=>({
  connection,db,env,deploymentEnv:env?.VERCEL_ENV,guards:ownerGuards,
  connectionId:connection.clientId ?? null,
  writeKey:(tool,args)=>requestKey({neonOrg:connection.neonOrg},tool,args)
});
export const handlers={
  neon_enable_production:(args,context)=>enabled.handler(args,internalContext(context)),
  neon_disable_production:(args,context)=>disabled.handler(args,internalContext(context))
};
