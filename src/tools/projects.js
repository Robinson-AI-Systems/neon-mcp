import {projectScope,projectClient,projectRead,projectPages,projectSummary,
 branchSummary,computeSummary,operationSummary} from './project-context.js';
import {defineReadTool as read,readId as id,readText as text} from './read-descriptors.js';
export const tools=[
 read('neon_project_list','List bounded, organization-matched projects or the single scoped project.',{
  recoverable:{type:'boolean'},limit:{type:'integer',minimum:1,maximum:100}}),
 read('neon_project_list_regions','Show Neon regions available to the selected organization.',{}),
 read('neon_project_overview','Summarize one allowed project with branches, computes and recent operations.',{
  projectId:id})
];
export function createProjectReadHandlers({getClient=projectClient}={}){
 return {
  async neon_project_list(args,ctx){
   const {client,scope}=await getClient(ctx);
   if(scope.scoped){
    const data=await projectRead(client,'getProject',{path:{project_id:scope.scoped}});
    if(data?.project?.id!==scope.scoped||data.project.org_id!==scope.org)
     throw new Error('Project identity could not be verified');
    return text({projects:args.recoverable===true?[]:[projectSummary(data.project)],
     capped:false,scope:'project'});
   }
   const page=await projectPages(client,'listProjects',{
    query:{org_id:scope.org,...(args.recoverable===true?{recoverable:true}:{})}},
    'projects',{max:Math.min(100,args.limit??50)});
   if(page.items.some(p=>p.org_id!==scope.org))throw new Error('Organization mismatch');
   return text({projects:page.items.map(projectSummary),capped:page.capped,scope:'organization'});
  },
  async neon_project_list_regions(_args,ctx){
   const {client,scope}=await getClient(ctx);
   const data=await projectRead(client,'getActiveRegions',{query:{org_id:scope.org}});
   if(!Array.isArray(data?.regions))throw new Error('Invalid regions');
   return text({regions:data.regions.map(r=>({id:r.region_id,name:r.name,
    default:r.default===true,location:{latitude:r.geo_lat,longitude:r.geo_long}}))});
  },
  async neon_project_overview(args,ctx){
   const wanted=projectScope(ctx,args.projectId??null).projectId;
   if(!wanted)throw new Error('Choose a project');
   const {client,scope}=await getClient(ctx,wanted);
   const data=await projectRead(client,'getProject',{path:{project_id:wanted}});
   if(data?.project?.id!==wanted||data.project.org_id!==scope.org)
    throw new Error('Project identity could not be verified');
   const path={project_id:wanted};
   const [branches,endpoints,operations]=await Promise.all([
    projectRead(client,'listProjectBranches',{path,query:{limit:100}}),
    projectRead(client,'listProjectEndpoints',{path}),
    projectRead(client,'listProjectOperations',{path,query:{limit:20}})
   ]);
   if(!Array.isArray(branches?.branches)||!Array.isArray(endpoints?.endpoints)||
      !Array.isArray(operations?.operations))throw new Error('Incomplete overview');
   return text({project:projectSummary(data.project),
    branches:branches.branches.slice(0,100).map(branchSummary),
    computes:endpoints.endpoints.slice(0,100).map(computeSummary),
    operations:operations.operations.slice(0,20).map(operationSummary)});
  }
 };
}
export const handlers=createProjectReadHandlers();
