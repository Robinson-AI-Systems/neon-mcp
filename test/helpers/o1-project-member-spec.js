// Supplemental O-1 provider contract for fake-provider testing, NOT a mutation of
// vendor/neon-openapi/v2.yaml's independently pinned SHA-256. Neon added these
// endpoints after the pinned SDK release; review their exact path/body against
// https://neon.com/docs/manage/orgs-api before accepting a new provider version.
import {loadNeonSpec} from './neon-spec.js';

const project='/projects/{project_id}/members';
const member='/projects/{project_id}/members/{member_id}/role';
const projectId={name:'project_id',in:'path',required:true,
 schema:{type:'string',pattern:'^[a-z0-9-]{1,60}$'}};
const memberId={name:'member_id',in:'path',required:true,
 schema:{type:'string',format:'uuid'}};
const item={type:'object',properties:{
 id:{type:'string'},member_id:{type:'string',format:'uuid'},
 user_id:{type:'string'},org_role:{type:'string'},project_role:{type:'string',nullable:true},
 effective_project_permission:{type:'string',nullable:true},
 org_default_project_permission:{type:'string',nullable:true},
 explicit_project_permission:{type:'string',nullable:true},
 credential_rotation_recommended:{type:'boolean'},
 org_api_key_rotation_recommended:{type:'boolean'}
}};
const output={type:'object',properties:{members:{type:'array',items:item},
 project_members:{type:'array',items:item}}};
const response=schema=>({'200':{description:'Provider result',content:{
 'application/json':{schema}}},default:{
 '$ref':'#/components/responses/GeneralError'}});
const operations={
 [project]:{parameters:[projectId],get:{
  operationId:'listProjectMembers',summary:'List project member roles',
  responses:response(output)
 }},
 [member]:{parameters:[projectId,memberId],
  put:{operationId:'setProjectMemberRole',summary:'Set explicit member project role',
   requestBody:{required:true,content:{'application/json':{schema:{
    type:'object',additionalProperties:false,required:['role'],
    properties:{role:{type:'string',enum:['viewer','editor','admin']}}
   }}}},responses:response({type:'object'})},
  delete:{operationId:'removeProjectMemberRole',summary:'Revert to inherited organization access',
   responses:response({type:'object'})}
 }
};

function extraRoutes(){
 const paths=[
  {method:'GET',template:project,names:['project_id'],operationId:'listProjectMembers',
   regex:/^\/projects\/([^/]+)\/members$/},
  {method:'PUT',template:member,names:['project_id','member_id'],
   operationId:'setProjectMemberRole',
   regex:/^\/projects\/([^/]+)\/members\/([^/]+)\/role$/},
  {method:'DELETE',template:member,names:['project_id','member_id'],
   operationId:'removeProjectMemberRole',
   regex:/^\/projects\/([^/]+)\/members\/([^/]+)\/role$/}
 ];
 return paths.map(p=>({...p,op:operations[p.template][p.method.toLowerCase()],
  parameters:operations[p.template].parameters}));
}
export function loadFakeNeonSpec(){
 const pinned=loadNeonSpec(),extra=extraRoutes();
 const byId=new Map(pinned.byId);
 for(const route of extra){
  if(byId.has(route.operationId))throw Error('Vendor now defines O-1 member API: remove supplemental fixture');
  byId.set(route.operationId,route);
 }
 return {
  spec:{...pinned.spec,paths:{...pinned.spec.paths,...operations}},
  routes:[...pinned.routes,...extra].sort((a,b)=>a.names.length-b.names.length),
  byId
 };
}
