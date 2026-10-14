// V-2: standalone, side-effect-free synthetic dataset discovery and preview.
import {defineReadTool,readText} from './read-descriptors.js';
import {SCENARIO_NAMES,listDemoScenarios,planDemoScenario} from '../dev/scenarios.js';

export const tools=[defineReadTool('neon_dev_list_scenarios',
 'List four synthetic developer datasets or preview deterministic FK-ordered sample rows without connecting to Neon.',
 {scenario:{type:'string',enum:[...SCENARIO_NAMES]},
  rowsPerTable:{type:'integer',minimum:1,maximum:100},
  seed:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$'}},
 {area:'developer',audience:['builder','owner','operator']})];
export const handlers={
 async neon_dev_list_scenarios(args={}){
  if(args.rowsPerTable!==undefined||args.seed!==undefined)
   if(!args.scenario)throw TypeError('Choose a scenario to preview rows');
  if(!args.scenario)return readText({syntheticOnly:true,execution:'none',
    scenarios:listDemoScenarios()});
  return readText(planDemoScenario(args));
 }
};
