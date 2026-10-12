import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch,mainEndpoint,devEndpoint,operation} from '../../test/helpers/neon-fixtures.js';
import {projectScope,projectPages} from '../../src/tools/project-context.js';
import {createProjectReadHandlers} from '../../src/tools/projects.js';

const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'}};
function setup(){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_D1_discovery_fixture',orgId:IDS.org,fetch:fake.fetch,
  budget:{async consume(){return {allowed:true}}}});
 const handlers=createProjectReadHandlers({getClient:async(c,id)=>{
  const s=projectScope(c,id);return {client,scope:s};
 }});
 return {fake,handlers};
}
const content=async(result)=>JSON.parse(result.content[0].text);
describe('D-1 scoped, summarized discovery',()=>{
 it('refuses foreign project, non-owner unscoped and malformed ids before network',()=>{
  expect(()=>projectScope(ctx,'another-project')).toThrow(/scope/);
  expect(()=>projectScope({connection:{neonOrg:IDS.org,profile:'read_only'}},IDS.project)).toThrow(/owner/);
  expect(()=>projectScope({connection:{neonOrg:IDS.org,projectScope:'INVALID!',profile:'full'}})).toThrow(/scope/);
 });
 it('returns a single scoped project with no credentials and no extra API calls',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project({name:'safe'})});
  const result=await content(await handlers.neon_project_list({},ctx));
  expect(result.projects).toHaveLength(1);
  expect(result.projects[0].name).toBe('safe');
  expect(JSON.stringify(result)).not.toMatch(/proxy_host|password|napi_|postgres:\/\//);
  expect(fake.calls.map(x=>x.operationId)).toEqual(['getProject']);
  fake.assertClean();
 });
 it('reads supported regions with the exact organization query',async()=>{
  const {fake,handlers}=setup();
  fake.when('getActiveRegions').resolves({regions:[{
   region_id:'aws-us-east-2',name:'US East',default:true,geo_lat:'40',geo_long:'-80'
  }]});
  const v=await content(await handlers.neon_project_list_regions({},ctx));
  expect(v.regions[0]).toMatchObject({id:'aws-us-east-2',default:true});
  expect(fake.calls[0].query.org_id).toBe(IDS.org);
  fake.assertClean();
 });
 it('summarizes project branches, computes and operations without hosts or secrets',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('listProjectBranches').resolves({branches:[mainBranch(),devBranch()],annotations:{}});
  fake.when('listProjectEndpoints').resolves({endpoints:[mainEndpoint(),devEndpoint()]});
  fake.when('listProjectOperations').resolves({operations:[operation({status:'finished'})]});
  const result=await content(await handlers.neon_project_overview({projectId:IDS.project},ctx));
  expect(result.branches).toHaveLength(2);
  expect(result.computes).toHaveLength(2);
  expect(result.operations).toHaveLength(1);
  expect(JSON.stringify(result)).not.toMatch(/proxy_host|host|password|neon\.tech/);
  expect(fake.calls).toHaveLength(4);
  fake.assertClean();
 });
 it('follows real pagination.cursor and fails closed on repeated cursors',async()=>{
  const {fake}=setup();
  fake.when('listProjects').resolves({projects:[project({active_time:0})],applications:{},integrations:{},pagination:{cursor:'next-page'}});
  fake.when('listProjects').resolves({projects:[project({id:'proj-fake-000002',active_time:0})],applications:{},integrations:{}});
  const client=makeNeonClient({key:'napi_FAKE_D1_pages_fixture',orgId:IDS.org,fetch:fake.fetch,
   budget:{async consume(){return {allowed:true}}}});
  const res=await projectPages(client,'listProjects',{query:{org_id:IDS.org}},'projects');
  expect(res.items).toHaveLength(2);
  expect(fake.calls[1].query.cursor).toBe('next-page');
  fake.assertClean();
 });
});
