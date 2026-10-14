// V-2: standalone, side-effect-free synthetic dataset discovery and preview.
import {defineReadTool,readText} from './read-descriptors.js';
import {SCENARIO_NAMES,listDemoScenarios,planDemoScenario} from '../dev/scenarios.js';
import {chooseDemoScenario} from '../dev/scenario-choice.js';

export const tools=[defineReadTool('neon_dev_list_scenarios',
 'List four synthetic developer datasets or preview deterministic FK-ordered sample rows without connecting to Neon.',
 {scenario:{type:'string',enum:[...SCENARIO_NAMES]},
  description:{type:'string',minLength:5,maxLength:400},
  rowsPerTable:{type:'integer',minimum:1,maximum:100},
  seed:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$'}},
 {area:'developer',audience:['builder','owner','operator']})];
export const handlers={
 async neon_dev_list_scenarios(args={}){
  const hasChoice=args.scenario!==undefined||args.description!==undefined;
  if(!hasChoice){
   if(args.rowsPerTable!==undefined||args.seed!==undefined)
    throw TypeError('Choose a scenario or description to preview rows');
   return readText({syntheticOnly:true,execution:'none',
    scenarios:listDemoScenarios()});
  }
  const chosen=chooseDemoScenario(args);
  const plan=planDemoScenario({...args,scenario:chosen.scenario});
  return readText({...plan,mappedFromDescription:chosen.matchedFromDescription,
   matchedTerms:chosen.matchedTerms});

 }
};
