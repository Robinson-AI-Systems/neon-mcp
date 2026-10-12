#!/usr/bin/env node
// One-shot GitHub REST check-run gate. No sleep, network requests or retry loop.
// Usage: gh api repos/OWNER/REPO/commits/SHA/check-runs --paginate=false | node scripts/ci-head-gate.mjs SHA
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const required=['check','unit','db','ci'];
const classify=name=>{
 if(name==='ci')return 'ci';
 if(/^check \(/.test(name))return 'check';
 if(/^unit \(/.test(name))return 'unit';
 if(/^db \(/.test(name))return 'db';
 return null;
};
export function summarizeExactHeadRuns(payload,sha){
 if(typeof sha!=='string'||!/^[0-9a-f]{40}$/i.test(sha)||
    !payload||!Array.isArray(payload.check_runs))
  return {state:'unverified',exitCode:3,reason:'A 40-character exact head SHA and GitHub check_runs response are required'};
 const matched=payload.check_runs.filter(x=>classify(x?.name));
 if(matched.some(x=>x.head_sha!==sha))
  return {state:'unverified',exitCode:3,reason:'Check results include a different head SHA'};
 const status={};
 for(const kind of required){
  const candidate=matched.filter(x=>classify(x.name)===kind);
  if(candidate.length!==1){
   return {state:'unverified',exitCode:3,reason:'Expected exactly one '+kind+' check for the exact head'};
  }
  status[kind]={status:candidate[0].status,conclusion:candidate[0].conclusion};
 }
 if(Object.values(status).some(x=>x.status==='completed'&&x.conclusion!=='success'))
  return {state:'failed',exitCode:1,checks:status};
 if(Object.values(status).some(x=>x.status!=='completed'))
  return {state:'pending',exitCode:2,checks:status};
 return {state:'success',exitCode:0,checks:status};
}
export function main(argv=process.argv,stdin=readFileSync(0,'utf8')){
 let parsed;
 try{parsed=JSON.parse(stdin);}
 catch{parsed=null;}
 const outcome=summarizeExactHeadRuns(parsed,argv[2]);
 process.stdout.write(JSON.stringify(outcome)+'\n');
 return outcome.exitCode;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 process.exitCode=main();
