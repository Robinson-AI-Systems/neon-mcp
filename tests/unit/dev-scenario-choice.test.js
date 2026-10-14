import {describe,it,expect} from 'vitest';
import {chooseDemoScenario} from '../../src/dev/scenario-choice.js';
import {handlers as preview} from '../../src/tools/dev-scenarios.js';
import {createDemoSeedHandlers} from '../../src/tools/dev-seed.js';
import {makeContractFixture} from '../../test/helpers/write-contract.js';

const parsed=r=>JSON.parse(r.content[0].text);
describe('V-2 natural-language demo choice',()=>{
 it('maps clear user descriptions to one deterministic fully synthetic scenario',()=>{
  const cases=[
   ['build SaaS subscription invoices','saas'],
   ['retail storefront shopping cart and checkout','store'],
   ['I am prototyping a washer and dryer appliance rental service','rental'],
   ['a blog with article publishing and comments','blog']
  ];
  for(const [description,scenario] of cases){
   expect(chooseDemoScenario({description})).toMatchObject({
    scenario,matchedFromDescription:true});
   const v=chooseDemoScenario({description});
   expect(v.matchedTerms.length).toBeGreaterThan(0);
   expect(v).toEqual(chooseDemoScenario({description}));
  }
 });
 it('never guesses for unsupported or ambiguous descriptions or accepts combined inputs',()=>{
  for(const description of ['make an app for people','subscription rental billing',
   'retail blog publishing','DROP TABLE users','a','a'.repeat(401)])
   expect(()=>chooseDemoScenario({description})).toThrow();
  expect(()=>chooseDemoScenario({scenario:'blog',description:'a blog'})).toThrow();
  expect(()=>chooseDemoScenario({scenario:'finance'})).toThrow();
 });
 it('previews mapped scenario and exact 100-row/table cap without database contact',async()=>{
  const data=parsed(await preview.neon_dev_list_scenarios({
   description:'A local appliance rental and leasing management system',
   rowsPerTable:100,seed:'safe'}));
  expect(data).toMatchObject({scenario:'rental',mappedFromDescription:true,
   tableCount:5,totalRows:500,execution:'none',syntheticOnly:true});
  expect(data.tables.every(t=>t.sample.length===3)).toBe(true);
  await expect(preview.neon_dev_list_scenarios({
   description:'subscription rental business'})).rejects.toThrow('Ambiguous');
 });
 it('accepts owner confirmation for unambiguous mapped 100-row seed only',async()=>{
  const args={projectId:'proj-description',branchId:'br-description',runId:'run-owned',
   endpointId:'ep-description',databaseName:'db',roleName:'owner',
   description:'an appliance rental company',rowsPerTable:100,seed:'demo'};
  const f=makeContractFixture(),expiry=new Date(Date.now()+86400000).toISOString();
  f.ctx.connection={neonOrg:'org-fake',projectScope:args.projectId,profile:'full',mode:'preview'};
  f.ctx.getBranch=async()=>({id:args.branchId,project_id:args.projectId,
   protected:false,default:false,expires_at:expiry});
  f.ctx.db.getDevRun=async()=>({id:args.runId,status:'active'});
  f.ctx.db.listDevRunObjects=async()=>[{run_id:args.runId,object_type:'branch',
   object_id:args.branchId,cleaned:false,expires_at:expiry}];
  const built=createDemoSeedHandlers({contextFor:async()=>f.ctx,verifyTarget:async()=>({
   pid:args.projectId,bid:args.branchId,endpointId:args.endpointId,
   database:args.databaseName,role:args.roleName,endpoint:{host:'fake.neon.test'}
  }),admissionsFor:()=>({sqlSpendAdmission:async()=>true}),sqlFactory:()=>async()=>true,
   runner:async opts=>{
    expect(opts.statements).toHaveLength(16);
    expect(opts.expectedAffectedRows.slice(6)).toEqual(Array(10).fill(50));
    expect(opts.params.slice(6).every(x=>x.length===1&&x[0].length<=8192)).toBe(true);
    return {done:true,confirmed:true};
   }});
  const out=parsed(await built.handlers.neon_dev_seed({...args,confirm:true},{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  expect(out.preview).toContain('500 fabricated rental rows');
 });
});
