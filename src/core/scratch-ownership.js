// Passphrase-protected owner setup attestation for a genuinely isolated,
 // explicitly selected scratch project. Never inferred from names or key presence.
import {configuredSelfResource} from './self-resource.js';
import {mergeWithSelf,protectsTarget} from './protected-resources.js';
import {makeNeonClient} from '../neon/client.js';
import {makeNeonBudget} from '../neon/budget.js';
import {projectRead} from '../tools/project-context.js';

const ID=/^[a-z0-9-]{1,60}$/;
export const SCRATCH_PHRASE='I_CONFIRM_THIS_PROJECT_HAS_NO_APPLICATION_DEPENDENCIES';
export async function attestIsolatedScratch({
 db,vault,env=process.env,orgId,projectId,phrase,clientFor
}={}){
 if(!ID.test(orgId||'')||!ID.test(projectId||'')||
    phrase!==SCRATCH_PHRASE)throw Error('Explicit isolated-scratch owner attestation required');
 if(!db||typeof db.saveScratchAttestation!=='function'||
    typeof db.getProtectedResources!=='function'||
    typeof vault?.keyFor!=='function')throw Error('Owner evidence store unavailable');
 const self=configuredSelfResource(env);
 if(self.org!==orgId)throw Error('Owner and service organizations disagree');
 const protectedList=mergeWithSelf(await db.getProtectedResources(),self);
 if(protectsTarget(protectedList,{org:orgId,projectId}))
  throw Error('Cannot attest protected or service-owned projects as scratch');
 const grant=await vault.keyFor({orgId,projectId,need:'project'});
 if(grant?.kind!=='project'||!grant.key)throw Error('Exact selected-project key required');
 const client=clientFor?await clientFor({key:grant.key,orgId,projectId}):
  makeNeonClient({key:grant.key,orgId,
   budget:makeNeonBudget({db,apiKey:grant.key})});
 const response=await projectRead(client,'getProject',{path:{project_id:projectId}});
 const provider=response?.project;
 if(provider?.id!==projectId||provider.org_id!==orgId||
    typeof provider.name!=='string'||provider.name.length<1||
    provider.name.length>256)throw Error('Exact selected scratch identity unavailable');
 // Recheck the same protected inventory just before persisting the attestation.
 const last=mergeWithSelf(await db.getProtectedResources(),configuredSelfResource(env));
 if(protectsTarget(last,{org:orgId,projectId}))
  throw Error('Scratch was protected during owner inspection');
 const receipt=await db.saveScratchAttestation({
  orgId,projectId,projectName:provider.name});
 if(receipt!==true)throw Error('Owner scratch approval was not stored');
 return {projectId,verified:true};
}
export async function revokeIsolatedScratch({db,orgId,projectId}={}){
 if(!ID.test(orgId||'')||!ID.test(projectId||'')||
  typeof db?.revokeScratchAttestation!=='function')
  throw Error('Valid owner revocation required');
 return await db.revokeScratchAttestation({orgId,projectId})===true;
}
