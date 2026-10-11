import {it,expect} from 'vitest';
import {summarizeResources} from '../../src/tools/summaries.js';
import {projectFields,selectResult} from '../../src/core/result-rules.js';
import {scrubNeonResult} from '../../src/core/scrub.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
const fixture={projects:[{id:'prj-fake',name:'Fake',region_id:'aws-us-east-1',
 secret:'never',settings:{private:'hidden'},created_at:'2026-10-11T00:00:00Z'}]};
it('summarizes only stable resource fields without modifying original',()=>{
 const clean=scrubNeonResult(fixture);
 const out=summarizeResources(clean);
 expect(out.projects[0]).toMatchObject({id:'prj-fake',name:'Fake'});
 expect(out.projects[0]).not.toHaveProperty('settings');
 expect(fixture.projects[0]).toHaveProperty('settings');
 expect(selectResult(clean,{detail:'full'})).toEqual(clean);
});
it('projects nested fields and reports missing paths without inheriting prototypes',()=>{
 const clean=scrubNeonResult(fixture);
 const projected=projectFields(clean,{toString(){return 'projects,projects.length'}}.toString());
 expect(projected).toHaveProperty('unknownFields');
 expect(projectFields(clean,'projects,missing')).toEqual({projects:clean.projects,unknownFields:['missing']});
 for(const path of ['__proto__.polluted','constructor.prototype','projects..name'])
  expect(()=>projectFields(clean,path)).toThrow();
 expect(()=>projectFields(clean,'a,'.repeat(30))).toThrow();
});
it('supports result selection only after the boundary scrub',async()=>{
 const registry={tools:[{name:'neon_mock_read',writes:false,profiles:['read_only','full']}],
  handlers:{neon_mock_read:async()=>({content:[{type:'text',text:JSON.stringify({
   project:{id:'prj-fake',name:'Fake',api_key:'napi_FAKESECRET',unknown:'long'}})}]})}};
 const context={registry,name:'neon_mock_read',connection:{profile:'read_only'},
  env:{VERCEL_ENV:'preview'},db:{}};
 const result=await dispatchReadOnlyTool({...context,args:{fields:'project.id,project.api_key'}});
 const value=JSON.parse(result.content[0].text);
 expect(value.project.id).toBe('prj-fake');
 expect(value.unknownFields).toEqual(['project.api_key']);
 expect(JSON.stringify(value)).not.toContain('FAKESECRET');
});
