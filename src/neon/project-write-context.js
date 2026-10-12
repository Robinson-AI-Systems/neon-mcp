// Server-owned Neon mutation context. Production and spending default to denial.
import {configuredSelfResource} from '../core/self-resource.js';
import {checkProtectedTarget} from '../core/protected-resources.js';
import {checkProductionAccess} from './production.js';
import {createSpendGuard} from './spend.js';
import {requestKey,call} from './client.js';
import {projectClient} from '../tools/project-context.js';

export async function createProjectWriteContext({connection,db,env=process.env}={}){
 if(!connection?.neonOrg||!db)throw new Error('Authenticated connection and database required');
 const selfProject=configuredSelfResource(env);
 const spendGuard=createSpendGuard({db});
 const ctx={connection,db,env,selfProject,deploymentEnv:env.VERCEL_ENV,
  connectionId:connection.clientId??null,
  writeKey:(name,args)=>requestKey({neonOrg:connection.neonOrg,
   projectId:connection.projectScope??null},name,args),
  reserveSpendWrite:async({orgId,estimate,write,requestKey:key})=>{
   const decision=await spendGuard.reserve({
    orgId,estimate,confirm:true,write,requestKey:key});
   return decision.allowed===true?{created:true,id:decision.claimId}:null;
  },
  clientFor:async projectId=>(await projectClient({connection,db,env},projectId)).client,
  // Verified on-demand from Neon's org endpoint, not from caller-declared plan names.
  planFor:async()=>{
   if(connection.projectScope)throw new Error('Organization key needed to verify plan');
   const client=(await projectClient({connection,db,env},null)).client;
   const response=await call(client,'getOrganization',{path:{org_id:connection.neonOrg}});
   if(response.error||response.data?.id!==connection.neonOrg)
    throw new Error('Organization plan could not be independently verified');
   const value={launch:'Launch',scale:'Scale',free:'Free'}[
    String(response.data.plan||'').toLowerCase()];
   if(!value)throw new Error('Unrecognized organization plan');
   return {verified:true,name:value};
  }
 };
 ctx.guards={
  checkProtected:(target,c)=>target.target?.startsWith('project:create:')
   ? target.projectId===null : checkProtectedTarget(target,c),
  checkProduction:async(target,c,tool)=>{
   if(!target.target?.startsWith('project:create:'))
    return checkProductionAccess(target,c,tool);
   if(c.connection.profile!=='full'||c.connection.mode!=='production'||
      c.deploymentEnv!=='production'||typeof c.db.getNeonOrg!=='function')
    return {allowed:false,production:true};
   const org=await c.db.getNeonOrg(c.connection.neonOrg);
   return {allowed:org?.production_enabled===true,production:true};
  },
  // P owns app-profile adoption. Refuse existing resources without trusted app-ownership evidence.
  checkApp:async(target,c,args)=>{
   if(target.target?.startsWith('project:create:'))return true;
   let own;
   if(typeof c.db.getProjectAppOwnership==='function')
    own=await c.db.getProjectAppOwnership({
     orgId:c.connection.neonOrg,projectId:target.projectId});
   else {
    // Neon's application/integration maps are provider evidence, not caller-supplied flags.
    let data;
    try{
     const client=await c.clientFor(target.projectId);
     data=(await call(client,'listProjects',{
     query:{org_id:c.connection.neonOrg,search:target.projectId,limit:100}}));
    }catch{return false;}
    if(data.error||!data.data?.applications||!data.data?.integrations)return false;
    const matches=data.data.projects?.filter(p=>p.id===target.projectId&&
     p.org_id===c.connection.neonOrg)||[];
    if(matches.length!==1)return false;
    const apps=data.data.applications[target.projectId]??[];
    const integrations=data.data.integrations[target.projectId]??[];
    if(!Array.isArray(apps)||!Array.isArray(integrations))return false;
    own={verified:true,appOwned:apps.length>0||integrations.length>0};
   }
   if(own?.verified!==true)return false;
   return own.appOwned===false||(own.appOwned===true&&args.outsideApp===true);
  },
  checkSpend:async(estimate,_target,c)=>{
   if(!estimate)return true;
   const check=await spendGuard.check({orgId:c.connection.neonOrg,estimate,confirm:true});
   return check.allowed===true;
  }
 };
 return ctx;
}
