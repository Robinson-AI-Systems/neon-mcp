import {describe,it,expect} from 'vitest';
import {mkdtempSync,cpSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Reproduce the serverless startup boundary without provider credentials or a DB.
// Separate processes are essential: the parser's eager init aborts the process.
describe('deployed PostgreSQL parser runtime assets',()=>{
 it('includes the pinned binary on API functions and parses SQL in an isolated package',()=>{
  const config=JSON.parse(readFileSync('vercel.json','utf8'));
  expect(config.functions['api/**/*.js'].includeFiles)
    .toBe('node_modules/libpg-query/wasm/libpg-query.wasm');
  const dir=mkdtempSync(join(tmpdir(),'neon-wasm-'));
  try{
   const packageDir=join(dir,'node_modules/libpg-query');
   cpSync('node_modules/@pgsql/types',join(dir,'node_modules/@pgsql/types'),{recursive:true});
   cpSync('node_modules/libpg-query',packageDir,{recursive:true});
   const run=()=>spawnSync(process.execPath,['--input-type=module','-e',
    `const {parse}=await import(${JSON.stringify(join(packageDir,'wasm/index.cjs'))});
     const tree=await parse('SELECT 1');
     if(!tree.stmts?.[0]?.stmt?.SelectStmt)process.exit(2);`],
    {encoding:'utf8',timeout:10000,maxBuffer:250000});
   const complete=run();
   expect(complete.stderr).toBe('');
   expect(complete.status).toBe(0);
   rmSync(join(packageDir,'wasm/libpg-query.wasm'));
   const missing=run();
   expect(missing.status).not.toBe(0);
   expect(missing.stderr).toContain('ENOENT');
   expect(missing.stderr).toContain('libpg-query.wasm');
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
