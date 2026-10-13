import {it,expect,vi} from 'vitest';
import {encryptSecret} from '../../src/core/crypto.js';
import {projectClient} from '../../src/tools/project-context.js';
import {createProjectReadHandlers} from '../../src/tools/projects.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project} from '../../test/helpers/neon-fixtures.js';
const fakeKey=n=>Buffer.alloc(32,n).toString('base64url');
const env={VERCEL_ENV:'production',TOKEN_ENCRYPTION_KEY:fakeKey(23)};
const connection={neonOrg:IDS.org,profile:'full'};
it('selects the exact project key for an unscoped full connection',async()=>{
 const row={org_id:IDS.org,kind:'project',project_id:IDS.project};
 row.key_enc=encryptSecret('napi_FAKE_project_routing_fixture',{env,context:JSON.stringify([IDS.org,'project',IDS.project])});
 const db={saveEncryptedNeonKey(){},consumeApiBudget:async()=>({allowed:true}),getEncryptedNeonKey:vi.fn(async()=>row)};
 const result=await projectClient({connection,db,env},IDS.project);
 expect(result.scope.projectId).toBe(IDS.project);
 expect(db.getEncryptedNeonKey).toHaveBeenCalledExactlyOnceWith({orgId:IDS.org,kind:'project',projectId:IDS.project});
 await expect(projectClient({connection:{...connection,projectScope:IDS.project},db,env},'foreign-project')).rejects.toThrow(/scope/);
 expect(db.getEncryptedNeonKey).toHaveBeenCalledTimes(1);
});
it('lists only enrolled active projects with actual provider readbacks and honest caps',async()=>{
 const fake=makeFakeNeon();fake.when('getProject').resolves({project:project()});
 const client=makeNeonClient({key:'napi_FAKE_project_catalog_fixture',orgId:IDS.org,fetch:fake.fetch,budget:{async consume(){return {allowed:true};}}});
 const calls=[];
 const handlers=createProjectReadHandlers({getClient:async(_ctx,id)=>{calls.push(id);if(!id){const e=Error('missing');e.code='NEON_KEY_UNAVAILABLE';throw e;}return {client};},getVault:()=>({listKeys:async()=>[
  {org_id:IDS.org,kind:'project',project_id:IDS.project},
  {org_id:IDS.org,kind:'project',project_id:'next-project'},
  {org_id:'foreign-org',kind:'project',project_id:'foreign-project'},
  {org_id:IDS.org,kind:'project',project_id:'revoked-project',revoked_at:'now'}]})});
 const result=JSON.parse((await handlers.neon_project_list({limit:1},{connection})).content[0].text);
 expect(result).toMatchObject({capped:true,scope:'enrolled_projects'});expect(result.projects[0].id).toBe(IDS.project);
 expect(calls).toEqual([undefined,IDS.project]);fake.assertClean();
});
it('does not turn provider or storage errors into successful partial inventories',async()=>{
 const handlers=createProjectReadHandlers({getClient:async()=>{throw Error('provider failed');},getVault:()=>{throw Error('must not enumerate');}});
 await expect(handlers.neon_project_list({},{connection})).rejects.toThrow('provider failed');
});
