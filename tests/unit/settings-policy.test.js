import {it,expect} from 'vitest';
import {validateSettingTightening as tighten} from '../../src/core/setting-constraints.js';
it('allows reducing only the two persisted spend caps',()=>{
 expect(tighten('spend.cap_per_day_cents',5000,4500)).toBe(4500);
 for(const key of ['spend.cap_per_day_cents','spend.cap_per_change_cents']){
  for(const next of [5000,6000,-1,1.5,'100',null])
   expect(()=>tighten(key,5000,next)).toThrow();
 }
});
it('reduces row count or disables reads but cannot reenable',()=>{
 expect(tighten('sql.read_policy',{maxRows:200,productionReads:true},
  {maxRows:90,productionReads:false})).toEqual({maxRows:90,productionReads:false});
 expect(()=>tighten('sql.read_policy',{maxRows:100,productionReads:false},
  {maxRows:200,productionReads:true})).toThrow();
 expect(()=>tighten('sql.read_policy',{maxRows:100,productionReads:false},
  {maxRows:100,productionReads:false})).toThrow();
 expect(()=>tighten('sql.read_policy',{maxRows:100,productionReads:true},
  {maxRows:90,productionReads:true,secret:'unexpected'})).toThrow();
});
it('refuses pricing, protected resources and all unknown/missing policies',()=>{
 for(const key of ['protected_resources','pricing','default_region','sql.affected_rows_tolerance','custom'])
  expect(()=>tighten(key,100,99)).toThrow();
 expect(()=>tighten('sql.read_policy',null,{maxRows:50,productionReads:false})).toThrow();
});
