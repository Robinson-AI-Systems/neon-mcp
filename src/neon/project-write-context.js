// Server-owned Neon mutation context. Production and spending default to denial.
import {configuredSelfResource} from '../core/self-resource.js';
import {checkProtectedTarget} from '../core/protected-resources.js';
import {checkProductionAccess} from './production.js';
import {createSpendGuard} from './spend.js';
import {requestKey} from './client.js';
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
  clientFor:async projectId=>(await projectClient({connection,db,env},projectId)).client
 };
 ctx.guards={
  checkProtected:(target,c)=>checkProtectedTarget(target,c),
  checkProduction:(target,c,tool)=>checkProductionAccess(target,c,tool),
  // P owns app-profile adoption. Refuse existing resources without trusted app-ownership evidence.
  checkApp:async(target,c,args)=>{
   if(target.target?.startsWith('project:create:'))return true;
   if(typeof c.db.getProjectAppOwnership!=='function')return false;
   const own=await c.db.getProjectAppOwnership({
    orgId:c.connection.neonOrg,projectId:target.projectId});
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
