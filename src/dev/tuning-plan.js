// V-4 narrow, AST-proved read-only query and independently quotable index
// suggestions. Never concatenate unreviewed SQL identifiers into DDL.
import {parse} from 'libpg-query';
import {classifySql} from '../neon/sql-guard.js';
import {quoteIdent} from '../neon/sql-ident.js';
import {createHash} from 'node:crypto';
const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const deny=()=>{throw Error('Only bounded, single-table read-only query tuning is supported');};
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function compileTunePlan({query,params=[],requestKey}={}){
 if(typeof query!=='string'||query.length<18||query.length>4000||
    !/^rmcp_[a-z0-9_]{5,128}$/.test(requestKey||'')||
    /(?:;|--|\/\*|\*\/|['"\x60])/u.test(query)||
    !Array.isArray(params)||params.length<1||params.length>3||
    params.some(x=>!['string','number','boolean'].includes(typeof x)||
     typeof x==='string'&&x.length>256))deny();
 let ast;
 try{ast=await parse(query);}catch{deny();}
 if(ast?.stmts?.length!==1||!ast.stmts[0]?.stmt?.SelectStmt)deny();
 const cls=await classifySql(query);
 if(cls.kind!=='read'||cls.unknownNode===true)deny();
 const trimmed=query.replace(/\s+/g,' ').trim();
 const match=/^SELECT (?:\*|[A-Za-z_][A-Za-z0-9_, ]{0,150}) FROM (?:(?<schema>[A-Za-z_][A-Za-z0-9_]*)\.)?(?<table>[A-Za-z_][A-Za-z0-9_]*) WHERE (?<terms>[A-Za-z0-9_\s=$]+?)(?: LIMIT (?<limit>[1-9][0-9]{0,3}))?$/i.exec(trimmed);
 if(!match)deny();
 const schema=match.groups.schema??'public',table=match.groups.table;
 if(!IDENT.test(schema)||!IDENT.test(table)||
    schema.startsWith('pg_')||schema==='information_schema')deny();
 const where=match.groups.terms.split(/\s+AND\s+/i),cols=[],bound=[];
 if(where.length<1||where.length>3)deny();
 for(const term of where){
  const m=/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$([1-3])$/i.exec(term.trim());
  if(!m||Number(m[2])>params.length||cols.includes(m[1])||
     !IDENT.test(m[1]))deny();
  cols.push(m[1]);bound.push(Number(m[2]));
 }
 if(new Set(bound).size!==params.length||!params.every((_,i)=>bound.includes(i+1))||
    match.groups.limit&&Number(match.groups.limit)>1000)deny();
 const name='rmcp_tune_'+hash(requestKey+'|'+schema+'|'+table+'|'+cols.join(',')).slice(0,20);
 const place=quoteIdent(schema)+'.'+quoteIdent(table);
 const columns=cols.map(quoteIdent).join(',');
 const create='CREATE INDEX '+quoteIdent(name)+' ON '+place+' ('+columns+')';
 const recommendation='CREATE INDEX CONCURRENTLY '+quoteIdent(name)+
   ' ON '+place+' ('+columns+')';
 return {query:trimmed,params,schema,table,columns:cols,
  indexName:name,createStatements:[create],recommendation,
  fingerprint:hash(JSON.stringify({query:trimmed,params,requestKey,create}))};
}
export function parseExplainJson(rows){
 const data=rows?.[0]?.['QUERY PLAN'];
 const record=Array.isArray(data)?data[0]:null;
 const plan=record?.Plan;
 const ms=record?.['Execution Time'];
 if(!plan||typeof ms!=='number'||!Number.isFinite(ms)||ms<0||
    ms>60000)deny();
 let nodes=0;const scans=[];
 function visit(node){
  if(!node||typeof node!=='object'||++nodes>100)deny();
  if(node['Node Type']==='Seq Scan'){
   const rel=node['Relation Name'];
   if(!IDENT.test(rel||''))deny();
   scans.push(rel);
  }
  const kids=node.Plans;
  if(kids!==undefined){
   if(!Array.isArray(kids)||kids.length>40)deny();
   for(const child of kids)visit(child);
  }
 }
 visit(plan);
 return {executionMs:ms,seqScans:[...new Set(scans)]};
}
export function summarizeTune({before,after,plan}={}){
 if(!before||!after||!plan||
    !Number.isFinite(before.executionMs)||!Number.isFinite(after.executionMs))deny();
 const candidate=before.seqScans.includes(plan.table);
 const improved=after.executionMs<before.executionMs;
 return {beforeMs:before.executionMs,afterMs:after.executionMs,
  beforeSequentialScans:before.seqScans.length,
  afterSequentialScans:after.seqScans.length,
  suggestedIndexes:candidate&&improved?[plan.recommendation]:[],
  explanation:candidate?
   improved?'A single-table sequential scan improved on the disposable copy':
    'The disposable-copy index did not improve this measured query':
   'No matching sequential scan was measured; no new index is advised'};
}
