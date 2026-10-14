// V-2: AST-reviewable SQL for synthetic data only. Never execute this plan directly.
// All names are service-defined or derived from a request-key digest, not user SQL.
import {createHash} from 'node:crypto';
import {quoteIdent} from '../neon/sql-ident.js';
import {generateDemoRows} from './scenarios.js';

const unique=new Set(['email','slug','sku','serial']);
const integer=c=>c==='id'||c==='quantity'||c.endsWith('_id')||c.endsWith('_cents');
const date=c=>c.endsWith('_on');
const safeName=/^rmcp_[a-z0-9_]{5,128}$/;
const bound=n=>Number.isSafeInteger(n)&&n>=1&&n<=20;
const part=n=>quoteIdent(n);
const tableName=(schema,table)=>part(schema)+'.'+part(table);
function parentKey(table){
 if(typeof table!=='string'||!table.endsWith('s'))throw Error('Unsupported scenario parent');
 return (table.endsWith('ies')?table.slice(0,-3)+'y':table.slice(0,-1))+'_id';
}
function columnDefinition(c,t,schema){
 const id=part(c);
 if(c==='id')return id+' integer PRIMARY KEY';
 const parent=t.dependsOn.find(d=>parentKey(d)===c);
 if(parent)return id+' integer NOT NULL REFERENCES '+tableName(schema,parent)+' ("id")';
 const type=integer(c)?'integer':date(c)?'date':'text';
 return id+' '+type+' NOT NULL'+
  (unique.has(c)?' UNIQUE':'')+
  (c==='quantity'?' CHECK ('+id+' > 0)':
   c.endsWith('_cents')?' CHECK ('+id+' >= 0)':'');
}
export function compileDemoSeed({scenario,seed='demo',rowsPerTable=3,requestKey}={}){
 if(!bound(rowsPerTable)||typeof requestKey!=='string'||
    !safeName.test(requestKey))throw Error('Bounded synthetic seed and stable audit key required');
 const tables=generateDemoRows({scenario,seed,rowsPerTable});
 if(tables.length!==5)throw Error('Exact five-table demonstration required');
 const schema='rmcp_demo_'+createHash('sha256').update(requestKey).digest('hex').slice(0,24);
 const statements=['CREATE SCHEMA '+part(schema)],params=[[]],expectedAffectedRows=[0];
 const seen=new Set(),details=[];
 for(const t of tables){
  if(seen.has(t.name)||t.dependsOn.some(parent=>!seen.has(parent))||
     t.columns[0]!=='id'||t.columns.length<2||t.columns.length>8||
     new Set(t.columns).size!==t.columns.length||
     t.dependsOn.some(parent=>!t.columns.includes(parentKey(parent))))
   throw Error('Unverified synthetic schema dependency or column contract');
  seen.add(t.name);
  const decl=t.columns.map(col=>columnDefinition(col,t,schema));
  statements.push('CREATE TABLE '+tableName(schema,t.name)+' ('+decl.join(', ')+')');
  params.push([]);expectedAffectedRows.push(0);
  details.push({name:t.name,columns:[...t.columns],dependsOn:[...t.dependsOn],
   rows:t.rows.map(x=>({...x}))});
 }
 for(const t of details){
  const keys=t.columns;
  const values=t.rows.flatMap(row=>keys.map(key=>row[key]));
  if(values.length<1||values.length>100||
     t.rows.some(row=>JSON.stringify(Object.keys(row))!==JSON.stringify(keys)))
   throw Error('Synthetic rows exceed parameter or column contract');
  const tuples=t.rows.map((row,i)=>
   '('+keys.map((_,j)=>'$'+(i*keys.length+j+1)).join(',')+')');
  statements.push('INSERT INTO '+tableName(schema,t.name)+' ('+
   keys.map(part).join(',')+') VALUES '+tuples.join(','));
  params.push(values);
  expectedAffectedRows.push(t.rows.length);
 }
 return {schema,scenario,seed,rowsPerTable,totalRows:rowsPerTable*tables.length,
  statements,params,expectedAffectedRows,tables:details};
}
function normalized(value){
 if(value instanceof Date)return value.toISOString().slice(0,10);
 return value;
}
// Independently compare every seeded cell on a fresh scoped direct SQL session;
// no row content is included in the tool response or audit.
export async function verifyDemoSeed({plan,query}={}){
 if(!plan||typeof query!=='function'||!Array.isArray(plan.tables)||
    plan.tables.length!==5)return false;
 for(const t of plan.tables){
  const sql='SELECT '+t.columns.map(part).join(',')+
   ' FROM '+tableName(plan.schema,t.name)+' ORDER BY "id" LIMIT 21';
  const observed=await query(sql,[]);
  if(!Array.isArray(observed?.rows)||observed.rows.length!==t.rows.length||
     t.rows.length>20)return false;
  for(let i=0;i<t.rows.length;i++){
   const actual=observed.rows[i],expected=t.rows[i];
   if(Object.keys(actual).length!==t.columns.length)return false;
   for(const name of t.columns)
    if(normalized(actual[name])!==expected[name])return false;
  }
 }
 return true;
}
