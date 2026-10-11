// B-7: static declarations are mandatory. This check never executes a write handler.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export function checkWrites(tools,handlers=null) {
  const failures=[];
  const seen=new Set();
  for(const tool of tools) {
    const name=tool?.name ?? '(unnamed)';
    if(!/^neon_[a-z0-9_]+$/.test(name))failures.push(name+': tool names start with neon_ (DECISIONS 2026-10-10)');
    if(seen.has(name))failures.push(name+': duplicate declaration');
    seen.add(name);
    if(typeof tool?.writes!=='boolean')failures.push(name+': must declare writes: true | false');
    if(handlers && typeof handlers[name]!=='function')failures.push(name+': missing reachable handler');
    if(!tool?.writes)continue;
    const p=tool.inputSchema?.properties;
    if(!p?.dryRun || !p?.confirm)failures.push(name+': write tool missing dryRun/confirm inputs');
    if(tool.writeContract!=='defineWrite-v1')failures.push(name+': write tool missing declared write contract (defineWrite)');
    if(!['write','none'].includes(tool.productionEffect))failures.push(name+': write tool missing productionEffect declaration');
    if(typeof tool.destructive!=='boolean')failures.push(name+': write tool missing destructive declaration');
    if(typeof tool.spend!=='boolean')failures.push(name+': write tool missing spend declaration');
    if(typeof tool.secret!=='boolean')failures.push(name+': write tool missing secret declaration');
    if(tool.secret===true && (!['/api/neon/setup'].includes(tool.secretRoute) ||
      !tool.oneTimeOnly))failures.push(name+': secret-producing write missing one-time setup-page path');
    if(tool.key!=='project' && tool.key!=='org')failures.push(name+': write tool missing key kind');
    if(tool.spend===true && !p?.confirm)failures.push(name+': billable write missing spending confirmation');
    if(tool.destructive===true && tool.profiles?.includes('read_only'))
      failures.push(name+': destructive tool available to read_only');
    if(tool.key==='org' && (tool.profiles||[]).some(profile=>profile!=='full'))
      failures.push(name+': org-key tool must be full only');
  }
  return failures;
}
async function main(){
  const {registry}=await import(pathToFileURL(path.resolve('src/tools/index.js')).href);
  const failures=checkWrites(registry.tools,registry.handlers);
  if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
  else console.log('Write safety: '+registry.tools.length+' tools checked');
}
if(process.argv[1]?.endsWith('check-writes.mjs'))await main();
