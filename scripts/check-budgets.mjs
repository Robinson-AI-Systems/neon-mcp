// C-2 pinned o200k-base BPE context budgets. Fail CI before listing regressions reach clients.
import {countTokens} from 'gpt-tokenizer';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {registry} from '../src/tools/index.js';
import {listVisibleToolMetadata,publicToolMetadata,dispatchReadOnlyTool} from '../src/core/mcp-server.js';
import {profileToolCounts} from '../src/core/profiles.js';

export const DESCRIPTION_MAX=160;
export const CATALOG_TOKEN_BUDGET=20000;
export const COMPACT_TOKEN_BUDGET=5000;
export const SCHEMA_TOKEN_BUDGET=1500;
export const estimateTokens=value=>countTokens(JSON.stringify(value??{}));

export function checkBudgets(tools,{catalogTools=tools}={}){
 const failures=[];
 for(const t of tools){
  const length=(t.description||'').length;
  if(!length)failures.push(t.name+': missing description');
  if(length>DESCRIPTION_MAX)failures.push(t.name+': description '+length+' > '+DESCRIPTION_MAX+' characters');
  const tokens=estimateTokens(publicToolMetadata(t).inputSchema);
  if(tokens>=SCHEMA_TOKEN_BUDGET)failures.push(t.name+': schema '+tokens+' >= '+SCHEMA_TOKEN_BUDGET);
 }
 // Legacy standalone catalog check: existing synthetic test fixtures are also subject to exact BPE.
 const tokens=estimateTokens(catalogTools);
 if(tokens>CATALOG_TOKEN_BUDGET)failures.push('catalog ~'+tokens+' tokens > '+CATALOG_TOKEN_BUDGET);
 return failures;
}
export function evaluateRegistryBudgets(source=registry,catalog=null) {
 const failures=[];
 const connection={profile:'everyday',listing:'compact',mode:'preview',neonOrg:'org-fixture'};
 const env={VERCEL_ENV:'production'};
 const compact=estimateTokens(listVisibleToolMetadata({registry:source,connection,env}));
 const catalogTools=listVisibleToolMetadata({registry:source,connection:{...connection,listing:'catalog'},env});
 const everyday=estimateTokens(catalogTools);
 failures.push(...checkBudgets(source.tools,{catalogTools}));
 if(compact>=COMPACT_TOKEN_BUDGET)failures.push('compact listing '+compact+' >= '+COMPACT_TOKEN_BUDGET);
 if(everyday>=CATALOG_TOKEN_BUDGET)failures.push('everyday catalog '+everyday+' >= '+CATALOG_TOKEN_BUDGET);
 const counts=profileToolCounts(source.tools,{productionDeployment:true});
 if(catalog!==null) {
  const match=/Implemented registry at #[0-9]+[^\n]*`read_only` (\d+); `everyday` (\d+); `full` (\d+)/.exec(catalog);
  if(!match)failures.push('TOOL-CATALOG missing implemented profile totals');
  else for(const [i,key] of ['read_only','everyday','full'].entries()) {
   if(Number(match[i+1])!==counts[key])failures.push('TOOL-CATALOG '+key+' count '+match[i+1]+' != '+counts[key]);
  }
  const registered=new Set([...catalog.matchAll(/^\| `(neon_[a-z0-9_]+)` \|/gm)].map(m=>m[1]));
  for(const t of source.tools)if(!registered.has(t.name))failures.push(t.name+': missing TOOL-CATALOG row');
 }
 return {failures,counts,compact,everyday};
}
export async function verifyDefaultFixture(){
 const saved=[],name='neon_budget_fixture_read_100';
 const fixture={name,writes:false,profiles:['everyday'],description:'Inspect a 100-item test fixture.',
  inputSchema:{type:'object',properties:{},additionalProperties:false}};
 const source={tools:[fixture],handlers:{[name]:async()=>({content:[{type:'text',
  text:JSON.stringify({data:Array.from({length:100},(_,i)=>({
   id:'item-'+i,name:'Sample entry repeated '.repeat(8),password:'FAKE_BUDGET_SECRET'}))})}]})}};
 const out=await dispatchReadOnlyTool({registry:source,name,args:{detail:'full'},
  connection:{clientId:'fixture-client',neonOrg:'org-fixture',projectScope:'proj-fixture',
   profile:'everyday',listing:'compact',mode:'preview'},
  db:{async saveResultHandle(row){saved.push(row);}},env:{VERCEL_ENV:'preview'}});
 const bytes=Buffer.byteLength(JSON.stringify(out));
 const handle=out.content?.[0]?.text?.includes('"handle"');
 const secretFree=!JSON.stringify(out).includes('FAKE_BUDGET_SECRET') &&
   !JSON.stringify(saved).includes('FAKE_BUDGET_SECRET');
 return {bytes,handle,stored:saved.length,secretFree,
  ok:out.isError!==true&&bytes<=8192&&handle&&saved.length===1&&secretFree};
}
async function main(){
 const catalog=readFileSync('docs/TOOL-CATALOG.md','utf8');
 const state=evaluateRegistryBudgets(registry,catalog);
 const fixture=await verifyDefaultFixture();
 if(!fixture.ok)state.failures.push('100-item read result was not bounded and stored as secret-free handle');
 console.log('Tokenizer: gpt-tokenizer@3.4.0 (o200k_base)');
 console.log('Compact '+state.compact+' (<5000); everyday catalog '+state.everyday+
  ' (<20000); fixture response '+fixture.bytes+' bytes; profile counts '+JSON.stringify(state.counts));
 if(state.failures.length){console.error(state.failures.join('\n'));process.exitCode=1;}
 else console.log('C-2 context budgets passed');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 await main().catch(e=>{console.error('C-2 budget check failed:',e.message);process.exitCode=1;});
