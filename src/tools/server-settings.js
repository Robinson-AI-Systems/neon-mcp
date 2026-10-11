// Globally stored safety settings: a production-deployment owner may tighten, never widen.
import {defineWrite} from '../core/write.js';
import {requestKey} from '../neon/client.js';
import {validateSettingTightening} from '../core/setting-constraints.js';
const guards=Object.freeze({checkProtected:async()=>true,
 checkApp:async()=>true,checkProduction:async()=>({allowed:true,production:false}),
 checkSpend:async()=>true});
const organization=c=>{
 if(!c?.neonOrg||c.projectScope||c.project_scope)throw new Error('Unscoped organization owner required');
 return c.neonOrg;
};
const rows=ctx=>ctx.db.listSafeSettings();
const chosen=async(ctx,key)=>(await rows(ctx)).find(x=>x.key===key)||null;
const setting=defineWrite({
 name:'neon_update_settings',key:'org',access:true,productionEffect:'none',
 plan:async(args,ctx)=>{
  const orgId=organization(ctx.connection);
  if(!await ctx.db.getNeonOrg(orgId))throw new Error('Unknown organization');
  // Organization-key possession is required for owner-wide settings.
  if(!await ctx.db.getEncryptedNeonKey({orgId,kind:'org'}))throw new Error('Organization key required');
  const current=await chosen(ctx,args.setting);
  if(!current)throw new Error('Setting is not editable');
  const value=validateSettingTightening(args.setting,current.value,args.value);
  return {before:current.value,value,target:'server-setting:'+args.setting,
   summary:'Tighten server setting '+args.setting+' from '+JSON.stringify(current.value)+
    ' to '+JSON.stringify(value),projectId:null,branchId:null};
 },
 apply:async(args,ctx,{before})=>({confirmed:await ctx.db.updateTightenedSetting({
  key:args.setting,prior:before,value:args.value})}),
 readAfter:async(args,ctx)=>chosen(ctx,args.setting),
 verify:async(_before,after,args)=>JSON.stringify(after?.value)===JSON.stringify(args.value)
});
export const tools=[{...setting.tool,profiles:['full'],
 description:'Preview and confirm a stricter server spending cap or SQL read policy; never widen limits.',
 inputSchema:{type:'object',properties:{...setting.tool.inputSchema.properties,
  setting:{type:'string',enum:['spend.cap_per_change_cents','spend.cap_per_day_cents','sql.read_policy']},
  value:{oneOf:[{type:'integer',minimum:0},{type:'object',properties:{
    maxRows:{type:'integer',minimum:1,maximum:200},productionReads:{type:'boolean'}},
    required:['maxRows','productionReads'],additionalProperties:false}]}},
 required:['setting','value'],additionalProperties:false}}];
const trusted=({connection,db,env})=>({connection,db,env,
 deploymentEnv:env?.VERCEL_ENV,guards,connectionId:connection?.clientId??null,
 writeKey:(name,args)=>requestKey({neonOrg:connection?.neonOrg},name,args)});
export const handlers={neon_update_settings:(args,ctx)=>setting.handler(args,trusted(ctx))};
