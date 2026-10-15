// V-4 integration readiness is an evidence report, not a provisioning action.
// Unknown observations are always missing, never inferred as configured.
const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const NEXT={
 tables:'neon_dev_migration_preview',migration:'neon_schema_list_migrations',
 extensions:'neon_schema_enable_extension',roles:'neon_role_create',
 pooled:'Use a Neon pooled endpoint host in the app environment',
 default:'neon_branch_set_protected',expiry:'neon_branch_set_expiration',
 auth:'Configure Neon Auth with owner approval',
 dataApi:'Configure Neon Data API with owner approval',
 quota:'Review current branch and compute quotas with the owner'
};
const missing=why=>({status:'missing',why});
const ok=()=>({status:'ok'});
const validNames=(items,max=12)=>Array.isArray(items)&&items.length<=max&&
 items.every(x=>typeof x==='string'&&IDENT.test(x));
export const INTEGRATION_TABLES_SQL='SELECT n.nspname AS schema_name,'+
 ' c.relname AS table_name FROM pg_catalog.pg_class c'+
 ' JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace'+
 " WHERE n.nspname NOT LIKE 'pg_%' AND"+
 " n.nspname<>'information_schema' AND c.relkind IN ('r','p')"+
 ' ORDER BY n.nspname,c.relname LIMIT 101';
export const INTEGRATION_EXTENSIONS_SQL='SELECT extname AS extension_name'+
 ' FROM pg_catalog.pg_extension ORDER BY extname LIMIT 101';
export function evaluateIntegration(spec,evidence){
 if(!spec||!evidence||!validNames(spec.expectedExtensions??[])||
    !validNames(spec.expectedRoles??[])||!Array.isArray(spec.expectedTables)||
    spec.expectedTables.length<1||spec.expectedTables.length>12||
    spec.expectedTables.some(x=>typeof x!=='string'||
     !/^[A-Za-z_][A-Za-z0-9_]{0,62}\.[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(x)))
  throw Error('Complete bounded integration spec required');
 const rows=[],put=(key,pass,reason,action=NEXT[key])=>{
  rows.push({key,status:pass===true?'ok':'missing',
   ...(pass===true?{}:{why:reason,action})});
 };
 const tables=evidence.tables,extensions=evidence.extensions;
 const list=(v,m,n)=>Array.isArray(v)&&v.length<=m&&
   v.every(n);
 const tableSet=list(tables,100,x=>typeof x?.schema_name==='string'&&
  typeof x.table_name==='string')?
  new Set(tables.map(x=>x.schema_name+'.'+x.table_name)):null;
 const extensionSet=list(extensions,100,x=>typeof x?.extension_name==='string')?
  new Set(extensions.map(x=>x.extension_name)):null;
 const roles=evidence.roles,roleSet=list(roles,100,x=>typeof x?.name==='string')?
  new Set(roles.map(x=>x.name)):null;
 for(const table of spec.expectedTables)
  put('table:'+table,tableSet?.has(table)===true,
   'Required table is not verified on the selected branch',NEXT.tables);
 if(spec.latestMigration)
  put('migration',evidence.latestMigration===spec.latestMigration,
   'Expected migration is not the verified latest applied migration');
 else put('migration',evidence.latestMigration!==null&&
  typeof evidence.latestMigration==='string',
  'Latest applied migration is unverified');
 for(const ext of spec.expectedExtensions??[])
  put('extension:'+ext,extensionSet?.has(ext)===true,
   'Required PostgreSQL extension not verified',NEXT.extensions);
 for(const role of spec.expectedRoles??[])
  put('role:'+role,roleSet?.has(role)===true,
   'Required branch role not found',NEXT.roles);
 const host=spec.pooledHost;
 put('pooling',typeof host==='string'&&host.length<=255&&
  !/[:/@?#]/.test(host)&&/^[a-z0-9.-]+$/i.test(host)&&
  /-pooler\.[a-z0-9.-]+\.neon\.tech$/i.test(host),
  'The supplied environment host is not a verified Neon pooler',NEXT.pooled);
 put('default_protection',evidence.defaultBranchProtected===true,
  'The actual default branch is not confirmed protected',NEXT.default);
 put('dev_expiry',evidence.devExpires===true,
  'The selected development branch has no safe future expiry',NEXT.expiry);
 put('neon_auth',spec.requireAuth!==true||evidence.authEnabled===true,
  'Neon Auth is not verified enabled',NEXT.auth);
 put('data_api',spec.requireDataApi!==true||evidence.dataApiEnabled===true,
  'Neon Data API is not verified enabled',NEXT.dataApi);
 put('quota',evidence.quota?.verified===true&&
  evidence.quota.branchRemaining>=0&&evidence.quota.computeRemaining>=0,
  'Project branch or compute quota is not verified',NEXT.quota);
 const total=rows.length,passed=rows.filter(r=>r.status==='ok').length;
 if(total>32)throw Error('Integration report exceeds safe result budget');
 return {ready:passed===total,passed,total,checks:rows};
}
