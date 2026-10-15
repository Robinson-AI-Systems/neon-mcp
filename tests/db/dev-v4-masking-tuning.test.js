import {beforeAll,afterAll,it,expect} from 'vitest';
import {openIsolatedSchema,closeIsolatedSchema,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
import {compileMaskPlan,MASK_COLUMNS_SQL} from '../../src/dev/masking-plan.js';
import {compileTunePlan,parseExplainJson,summarizeTune} from '../../src/dev/tuning-plan.js';
const key='rmcp_v4_pg_test_abcdef123456789';
let schema,child;
const q=s=>'"'+s+'"';
const run=async(text,params=[])=>rawQuery(text,params);
beforeAll(async()=>{
 schema=await openIsolatedSchema(requireLocalDatabaseUrl());
 child=schema+'_isolated_child';
 await run('CREATE SCHEMA '+q(child));
 await run('CREATE TABLE '+q(schema)+'.customers ('+
  'id integer PRIMARY KEY,email text NOT NULL,phone varchar(24) NOT NULL)');
 await run('CREATE TABLE '+q(schema)+'.widgets ('+
  'id integer PRIMARY KEY,status text NOT NULL,category_id integer NOT NULL)');
 await run('INSERT INTO '+q(schema)+'.widgets SELECT n,'+
  "CASE WHEN n=3 THEN 'rare' ELSE 'common' END,n%10"+
  ' FROM generate_series(1,6000) AS n');
 await run('ANALYZE '+q(schema)+'.widgets');
 await run('CREATE TABLE '+q(child)+'.widgets AS TABLE '+q(schema)+'.widgets');
 await run('ANALYZE '+q(child)+'.widgets');
});
afterAll(async()=>{
 try{if(child)await run('DROP SCHEMA '+q(child)+' CASCADE');}
 finally{await closeIsolatedSchema();}
});
it('adopts real PG catalog types but refuses any uncovered email/phone/text column',async()=>{
 const found=await run(MASK_COLUMNS_SQL);
 const source=found.filter(x=>x.schema_name===schema);
 expect(source.some(x=>x.column_name==='email')).toBe(true);
 const named=source.filter(x=>x.table_name==='customers');
 const rules=[{schemaName:schema,tableName:'customers',columnName:'email',preset:'email'},
  {schemaName:schema,tableName:'customers',columnName:'phone',preset:'text'},
  {schemaName:schema,tableName:'widgets',columnName:'status',preset:'text'}];
 const p=compileMaskPlan({rows:source,rules,databaseName:'devdb',requestKey:key});
 expect(p.maskedColumns).toBe(3);
 expect(p.columnsChecked).toBe(6);
 expect(p.rules.some(x=>x.masking_function==='anon.fake_email()')).toBe(true);
 expect(()=>compileMaskPlan({rows:source,rules:rules.slice(1),
  databaseName:'devdb',requestKey:key})).toThrow();
 expect(named.map(x=>x.column_name)).toEqual(['id','email','phone']);
});
it('runs a real PostgreSQL index experiment only on the disposable copy',async()=>{
 const sql='SELECT * FROM '+schema+'.widgets WHERE status = $1 LIMIT 100';
 const candidate=await compileTunePlan({query:sql,params:['rare'],requestKey:key});
 const onChild=sql.replace(schema+'.',child+'.');
 const before=await run('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+onChild,['rare']);
 const baseline=parseExplainJson(before);
 expect(baseline.seqScans).toContain('widgets');
 const indexSql=candidate.createStatements[0].replace(q(schema)+'.',q(child)+'.');
 await run(indexSql);
 const after=await run('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+onChild,['rare']);
 const tuned=parseExplainJson(after);
 expect(Number.isFinite(tuned.executionMs)).toBe(true);
 const result=summarizeTune({before:baseline,after:tuned,plan:candidate});
 expect(result.suggestedIndexes.length).toBeLessThanOrEqual(1);
 expect(candidate.recommendation).toContain('CREATE INDEX CONCURRENTLY');
 const original=await run("SELECT count(*)::integer AS n FROM pg_catalog.pg_indexes WHERE schemaname=$1 AND tablename='widgets'",[schema]);
 const copy=await run("SELECT count(*)::integer AS n FROM pg_catalog.pg_indexes WHERE schemaname=$1 AND tablename='widgets'",[child]);
 expect(original).toEqual([{n:1}]); // only original primary key
 expect(copy).toEqual([{n:1}]);
 const contents=await run('SELECT count(*)::integer AS n FROM '+q(schema)+'.widgets');
 expect(contents).toEqual([{n:6000}]);
});
