import {describe,it,expect} from 'vitest';
import {classifySql} from '../../src/neon/sql-guard.js';
import {createDataCompareHandlers,comparisonSql,PRIMARY_KEY_SQL,compareFingerprintMaps}
 from '../../src/tools/data-compare.js';
import {TABLES_SQL,COLUMNS_SQL} from '../../src/tools/schema-reads.js';
const scope=branchId=>({projectId:'proj-fake',branchId,endpointId:'ep-'+branchId,
 databaseName:'neondb',roleName:'owner'});
const args={left:scope('br-left'),right:scope('br-right'),schemaName:'public',tableNames:['people']};
const hex=n=>String(n).padStart(32,'0'),json=x=>JSON.parse(x.content[0].text);
function fixture({foreign=false,partial=false,drift=false,noKey=false,limit=false}={}){
 const calls=[],reads={};
 const h=createDataCompareHandlers({contextFor:async()=>({}),
  verifyTarget:async a=>({pid:foreign?'proj-other':a.projectId,bid:a.branchId,
   endpointId:a.endpointId,database:a.databaseName,role:a.roleName,endpoint:{host:'exact.fake'}}),
  query:async x=>{calls.push(x);const right=x.target.branchId==='br-right';let rows;
   if(x.text===TABLES_SQL)rows=[{table_name:'people',relation_kind:'r'}];
   else if(x.text===COLUMNS_SQL)rows=[{column_name:'id',data_type:'integer',nullable:false}];
   else if(x.text===PRIMARY_KEY_SQL)rows=noKey?[]:[{column_name:'id'}];
   else if(x.text.includes('AS key_hash'))rows=right?
    [{key_hash:hex(2),row_hash:hex(5)},{key_hash:hex(3),row_hash:hex(3)}]:
    [{key_hash:hex(1),row_hash:hex(1)},{key_hash:hex(2),row_hash:hex(2)}];
   else {const key=x.target.branchId;reads[key]=(reads[key]??0)+1;
    rows=[{row_count:limit?'50001':'2',checksum:drift&&reads[key]>2?hex(9):hex(right?2:1)}];}
   return {done:true,truncated:partial,rowCount:rows.length,rows};}
 });return {calls,h:h.neon_branch_compare_data};
}
describe('bounded branch data comparison',()=>{
 it('uses only parseable SELECTs, quoteIdent and bound offsets',async()=>{
  for(const sql of [PRIMARY_KEY_SQL,...Object.values(comparisonSql('public','people',['id']))])
   expect((await classifySql(sql)).kind).toBe('read');
  expect(comparisonSql('public','people',['id'],10).checksum).toContain('LIMIT 11');
  expect(()=>comparisonSql('public;DROP TABLE x','people')).toThrow();
  expect(comparisonSql('public','people',['odd"key']).page).toContain('"odd""key"');
 });
 it('reports actual added, removed and changed fingerprints without exposing them',async()=>{
  const f=fixture(),out=json(await f.h(args,{}));
  expect(out).toMatchObject({done:true,complete:true,atomicSnapshot:false});
  expect(out.tables[0]).toMatchObject({changes:{added:1,removed:1,changed:1},fingerprintEqual:false});
  expect(JSON.stringify(out)).not.toContain(hex(1));
  expect(f.calls.every(x=>x.target.pooled===false&&x.target.expectedEndpointHost==='exact.fake')).toBe(true);
 });
 it('fails closed for partial data, foreign target and concurrent drift',async()=>{
  for(const opts of [{foreign:true},{partial:true},{drift:true}])
   await expect(fixture(opts).h(args,{})).rejects.toThrow();
  const f=fixture({foreign:true});await expect(f.h(args,{})).rejects.toThrow();expect(f.calls).toHaveLength(0);
 });
 it('keeps row-limit and no-primary-key evidence explicit',async()=>{
  const limited=json(await fixture({limit:true}).h(args,{}));
  expect(limited).toMatchObject({complete:false});
  expect(limited.tables[0].reason).toBe('row_limit');
  const noKey=json(await fixture({noKey:true}).h(args,{}));
  expect(noKey.tables[0].changes).toBeNull();expect(noKey.tables[0].reason).toContain('no_primary_key');
 });
 it('compares empty key inventories and validates selection before reading',async()=>{
  expect(compareFingerprintMaps(new Map(),new Map())).toEqual({added:0,removed:0,changed:0});
  const f=fixture();await expect(f.h({...args,schemaName:'pg_catalog'},{})).rejects.toThrow();expect(f.calls).toHaveLength(0);
  await expect(f.h({...args,right:args.left},{})).rejects.toThrow();
 });
});
