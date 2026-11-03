// Static CAP-1 evidence only. A parsed call site is not proof it executed.
// Parsing avoids counting operation names in comments, docs, test strings or
// unrelated handlers in the same file as valid operation-to-tool coverage.
import {parse} from 'espree';

const operationCalls=new Set(['projectRead','projectPages','call','applyNeonWrite']);
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const literal=x=>x?.type==='Literal'&&typeof x.value==='string'?x.value:null;
function propertyName(property){
  return property?.key?.type==='Identifier'?property.key.name:
    literal(property?.key);
}
function operationFromCall(node){
  const method=node.callee?.type==='Identifier'?node.callee.name:null;
  if(!operationCalls.has(method))return null;
  if(method!=='applyNeonWrite')return {operationId:literal(node.arguments[1]),via:method};
  const input=node.arguments[0];
  const field=input?.type==='ObjectExpression'&&input.properties.find(p=>
    p.type==='Property'&&!p.computed&&propertyName(p)==='operationId');
  return {operationId:literal(field?.value),via:method};
}
export function collectSourceOperationReferences(sourceFiles,registeredTools){
  if(!isObject(sourceFiles)||!(registeredTools instanceof Set))
    throw new TypeError('Source map and registered tool set required');
  const result=new Map();
  for(const [path,text] of Object.entries(sourceFiles).sort(([a],[b])=>a.localeCompare(b))){
    if(!/^src\/tools\/[^/]+\.js$/.test(path)||typeof text!=='string')
      throw new TypeError('Unexpected operation source path');
    const ast=parse(text,{ecmaVersion:'latest',sourceType:'module',loc:true});
    function walk(node,handler=null){
      if(!node||typeof node!=='object')return;
      if(Array.isArray(node)){for(const item of node)walk(item,handler);return;}
      const nextHandler=node.type==='Property'&&
        node.value?.type==='FunctionExpression'&&
        registeredTools.has(propertyName(node))?propertyName(node):handler;
      if(node.type==='CallExpression'){
        const call=operationFromCall(node);
        if(call?.operationId){
          const hits=result.get(call.operationId)??[];
          hits.push({path,line:node.loc.start.line,via:call.via,
            handler:nextHandler??null,proof:'parsed_call_reference_not_executed'});
          result.set(call.operationId,hits);
        }
      }
      for(const [key,value] of Object.entries(node)){
        if(key==='loc'||key==='range'||key==='start'||key==='end')continue;
        if(value&&typeof value==='object')walk(value,nextHandler);
      }
    }
    walk(ast);
  }
  for(const list of result.values())list.sort((a,b)=>a.path.localeCompare(b.path)||
    a.line-b.line||a.via.localeCompare(b.via));
  return result;
}
