import {describe,it,expect} from 'vitest';
import {compileAutoSeed,verifyAutoSeed,AUTO_TABLES_SQL,AUTO_COLUMNS_SQL,
 AUTO_CONSTRAINTS_SQL,AUTO_UNSAFE_SQL} from '../../src/dev/auto-plan.js';
import {classifySql} from '../../src/neon/sql-guard.js';

const six=['organizations','users','plans','subscriptions','invoices','payments'];
const specs={
 organizations:[['id','int4'],['name','text']],
 users:[['id','int4'],['organization_id','int4'],['email','text']],
 plans:[['id','int4'],['slug','text'],['price_cents','int4']],
 subscriptions:[['id','int4'],['user_id','int4'],['plan_id','int4'],['status','text']],
 invoices:[['id','int4'],['subscription_id','int4'],['amount_cents','int4']],
 payments:[['id','int4'],['invoice_id','int4'],['paid_on','date'],['quantity','int4']]
};
const foreign=[
 ['users','organization_id','organizations'],
 ['subscriptions','user_id','users'],['subscriptions','plan_id','plans'],
 ['invoices','subscription_id','subscriptions'],['payments','invoice_id','invoices']
];
const requestKey='rmcp_auto_seed_fixture_123456789abcdef';
const schema='auto_fixture';
function makeCatalog({cycle=false,unsafe=false,conflict=false,check='CHECK ((price_cents >= 0))'}={}){
 const tables=six.map((table_name,i)=>({table_name,relation_oid:String(100+i)}));
 const columns=six.flatMap(table=>specs[table].map(([column_name,data_type])=>({
  table_name:table,column_name,data_type,required:true,identity:'',generated:'',
  type_modifier:-1
 })));
 const constraints=six.map(table=>({table_name:table,kind:'p',
  columns_json:'["id"]',references_json:'[]',referenced_table:null,
  referenced_schema:null,definition:'PRIMARY KEY (id)'}));
 constraints.push(...foreign.map(([table_name,col,parent])=>({
  table_name,kind:'f',columns_json:JSON.stringify([col]),
  references_json:'["id"]',referenced_table:parent,
  referenced_schema:schema,definition:'FOREIGN KEY ('+col+') REFERENCES '+parent+'(id)'
 })));
 constraints.push({table_name:'users',kind:'u',columns_json:'["email"]',
  references_json:'[]',definition:'UNIQUE (email)'});
 constraints.push({table_name:'plans',kind:'u',columns_json:'["slug"]',
  references_json:'[]',definition:'UNIQUE (slug)'});
 constraints.push({table_name:'plans',kind:'c',
  columns_json:'["price_cents"]',references_json:'[]',definition:check});
 if(cycle)constraints.push({table_name:'organizations',kind:'f',
  columns_json:'["id"]',references_json:'["id"]',referenced_table:'payments',
  referenced_schema:schema,definition:'FOREIGN KEY (id) REFERENCES payments(id)'});
 let hits=0;
 const query=async(sql,params)=>{
  expect(params).toHaveLength(1);
  if([AUTO_TABLES_SQL,AUTO_COLUMNS_SQL,AUTO_CONSTRAINTS_SQL,AUTO_UNSAFE_SQL].includes(sql))
   expect(params[0]).toBe(schema);
  if(sql===AUTO_TABLES_SQL)return tables;
  if(sql===AUTO_COLUMNS_SQL)return columns;
  if(sql===AUTO_CONSTRAINTS_SQL)return constraints;
  if(sql===AUTO_UNSAFE_SQL)return unsafe?[{table_name:'users'}]:[];
  if(sql.includes('FROM jsonb_array_elements($1::jsonb) AS candidate')){
   hits++;
   if(conflict&&sql.includes('"users"')&&sql.includes('"email"'))
    return [{candidate_id:JSON.parse(params[0])[0].id}];
   return [];
  }
  throw Error('Unreviewed SQL '+sql);
 };
 return {query,tables,columns,constraints,get hits(){return hits;}};
}
async function plan(o={},opts={}){
 return compileAutoSeed({existingSchema:schema,rowsPerTable:opts.count??4,
  requestKey,query:makeCatalog(o).query});
}
describe('V-2 six-table catalog-driven synthetic seeding',()=>{
 it('uses bounded AST-read-only catalogs, topological parent-first writes and complete preview',async()=>{
  const p=await plan();
  expect(p.mode).toBe('auto');
  expect(p.tableCount).toBe(6);
  expect(p.totalRows).toBe(24);
  expect(p.totalSkipped).toBe(0);
  expect(p.statements).toHaveLength(6);
  expect(p.tables.map(x=>x.name)).toEqual(six);
  expect(p.statements.join('\n')).not.toContain('Sample-');
  for(const sql of [AUTO_TABLES_SQL,AUTO_COLUMNS_SQL,
   AUTO_CONSTRAINTS_SQL,AUTO_UNSAFE_SQL,...p.statements]){
   const shape=await classifySql(sql);
   expect(shape.kind).toBe(p.statements.includes(sql)?'write':'read');
   expect(shape.unknownNode).toBe(false);
  }
  for(let i=0;i<p.params.length;i++){
   expect(p.params[i]).toHaveLength(1);
   expect(Buffer.byteLength(p.params[i][0])).toBeLessThanOrEqual(8192);
   expect(p.expectedAffectedRows[i]).toBe(4);
   expect(p.statements[i]).toContain('ON CONFLICT DO NOTHING');
  }
 });
 it('is deterministic, synthetic-only, and verifies all cells including dates',async()=>{
  const p=await plan(),again=await plan();
  expect(p.fingerprint).toBe(again.fingerprint);
  const emails=p.tables.find(x=>x.name==='users').rows.map(x=>x.email);
  expect(emails.every(x=>x.endsWith('@example.com'))).toBe(true);
  expect(p.tables[0].rows[0].id).toBe(p.tables[1].rows[0].organization_id);
  const result=await verifyAutoSeed({plan:p,query:async(sql)=>({
   rows:structuredClone(p.tables.find(t=>sql.includes('FROM "auto_fixture"."'+t.name+'"')).rows)
  })});
  expect(result).toBe(true);
  const tampered=await verifyAutoSeed({plan:p,query:async(sql)=>{
   const rows=structuredClone(p.tables.find(t=>sql.includes('FROM "auto_fixture"."'+t.name+'"')).rows);
   rows[0].id++;
   return {rows};
  }});
  expect(tampered).toBe(false);
 });
 it('skips unique conflicts and all dependent rows with no blind insert retries',async()=>{
  const p=await plan({conflict:true});
  expect(p.totalSkipped).toBe(4);
  expect(p.totalRows).toBe(20);
  expect(p.tables.find(t=>t.name==='users').rows).toHaveLength(3);
  expect(p.tables.find(t=>t.name==='subscriptions').rows).toHaveLength(3);
  expect(p.tables.find(t=>t.name==='invoices').rows).toHaveLength(3);
  expect(p.tables.find(t=>t.name==='payments').rows).toHaveLength(3);
  expect(p.expectedAffectedRows.reduce((a,b)=>a+b,0)).toBe(20);
 });
 it('refuses cycles, unsafe triggers/RLS, outside-schema FKs, unknown checks and bound violations',async()=>{
  await expect(plan({cycle:true})).rejects.toThrow(/safe six-table/);
  await expect(plan({unsafe:true})).rejects.toThrow(/safe six-table/);
  await expect(plan({check:'CHECK (price_cents <> 7)'})).rejects.toThrow(/safe six-table/);
  const f=makeCatalog();
  f.constraints.find(x=>x.kind==='f').referenced_schema='foreign_schema';
  await expect(compileAutoSeed({existingSchema:schema,rowsPerTable:3,
   requestKey,query:f.query})).rejects.toThrow(/safe six-table/);
  await expect(compileAutoSeed({existingSchema:schema,rowsPerTable:101,
   requestKey,query:makeCatalog().query})).rejects.toThrow(/safe six-table/);
  await expect(compileAutoSeed({existingSchema:'pg_catalog',rowsPerTable:2,
   requestKey,query:makeCatalog().query})).rejects.toThrow();
 });
 it('refuses credential-bearing or identity-sensitive schema columns',async()=>{
  const f=makeCatalog();
  f.columns.find(c=>c.table_name==='organizations'&&c.column_name==='name').column_name='password_hash';
  await expect(compileAutoSeed({existingSchema:schema,rowsPerTable:3,
   requestKey,query:f.query})).rejects.toThrow(/safe six-table/);
 });
 it('ties a stable fingerprint to changes in CHECK policy and catalog',async()=>{
  const a=await plan();
  const b=await plan({check:'CHECK ((price_cents >= 1))'});
  expect(a.fingerprint).not.toBe(b.fingerprint);
 });
});