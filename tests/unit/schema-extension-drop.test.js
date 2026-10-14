import {it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {parse} from 'libpg-query';
import {createExtensionDropHandlers,EXTENSION_STATUS_SQL,EXTENSION_DEPENDENCIES_SQL}
 from '../../src/tools/schema-extension-drop.js';
import {buildReviewedExtensionDDL} from '../../src/neon/sql-run.js';
const a={projectId:'proj-fake',branchId:'br-fake',endpointId:'ep-fake',
 databaseName:'neondb',roleName:'owner',extensionName:'hstore'};
const json=x=>JSON.parse(x.content[0].text);
function fixture({deps=[],partial=false,changed=false}={}){
 const calls=[],c={connection:{neonOrg:'org-fake',profile:'full',mode:'preview'},
  getBranch:async()=>({id:a.branchId}),writeKey:()=> 'rmcp_ext_drop_12345678',
  db:{recordWritePreview:async()=>{},reserveWrite:async()=>({created:true,id:1}),completeWrite:async()=>true},
  guards:{checkProtected:async()=>true,checkProduction:async()=>({allowed:true,production:false}),
   checkApp:async()=>true,checkSpend:async()=>true}};
 let reads=0;
 const h=createExtensionDropHandlers({contextFor:async()=>c,
  verifyTarget:async()=>({pid:a.projectId,bid:a.branchId,endpointId:a.endpointId,
   database:a.databaseName,role:a.roleName,endpoint:{host:'direct.fake'}}),
  query:async({text})=>{const rows=text===EXTENSION_STATUS_SQL?
   [{extension_oid:changed&&++reads>1?'124':'123',installed_version:'1.8'}]:
   deps.map(dependent_object=>({dependent_object}));
   return {done:true,truncated:partial,rowCount:rows.length,rows};},
  mutate:async x=>{calls.push(x);return {issued:true};}}).handlers.neon_schema_disable_extension;
 return {c,calls,h};
}
it('uses fixed bounded catalog reads and parser-pinned DROP EXTENSION RESTRICT',async()=>{
 for(const text of [EXTENSION_STATUS_SQL,EXTENSION_DEPENDENCIES_SQL])expect((await classifySql(text)).kind).toBe('read');
 const sql=buildReviewedExtensionDDL('hstore',false,true);
 expect(sql).toBe('DROP EXTENSION "hstore" RESTRICT');
 expect((await parse(sql)).stmts[0].stmt.DropStmt).toMatchObject({removeType:'OBJECT_EXTENSION',behavior:'DROP_RESTRICT'});
 expect(()=>buildReviewedExtensionDDL('hstore',true,true)).toThrow();
});
it('previews dependent objects but refuses any mutation when dependencies exist',async()=>{
 const f=fixture({deps:['column payload of table sample']});
 expect(json(await f.h({...a,dryRun:true},f.c)).dependencies).toEqual(['column payload of table sample']);
 const out=json(await f.h({...a,confirm:true},f.c));expect(out.done).toBe(false);expect(f.calls).toHaveLength(0);
});
it('refuses partial and changed extension identities before DDL',async()=>{
 for(const option of [{partial:true},{changed:true}]){
  const f=fixture(option);expect(json(await f.h({...a,confirm:true},f.c)).done).toBe(false);expect(f.calls).toHaveLength(0);
 }
});
