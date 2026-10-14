// B-8: owner MCP settings are allowed to tighten safety, never expand approved reach or spending.
const cents=new Set(['spend.cap_per_change_cents','spend.cap_per_day_cents']);
export const EDITABLE_SETTINGS=Object.freeze([...cents,'sql.read_policy','sql.maintenance_timeout_ms']);
export function validateSettingTightening(key,prior,next){
  if(!EDITABLE_SETTINGS.includes(key))throw new TypeError('Use the secure setup page for this setting');
  if(cents.has(key)){
    if(!Number.isSafeInteger(prior)||!Number.isSafeInteger(next)||next<0||next>=prior)
      throw new TypeError('A spending cap may only be reduced; increases need independent owner approval');
    return next;
  }
  if(key==='sql.maintenance_timeout_ms'){
    if(!Number.isSafeInteger(prior)||!Number.isSafeInteger(next)||
       prior<15000||prior>3600000||next<15000||next>=prior)
      throw new TypeError('Maintenance timeout may only be reduced, down to 15 seconds');
    return next;
  }
  const shape=v=>v && typeof v==='object' && !Array.isArray(v) &&
    Object.keys(v).sort().join(',')==='maxRows,productionReads' &&
    Number.isSafeInteger(v.maxRows)&&v.maxRows>=1&&v.maxRows<=200&&
    typeof v.productionReads==='boolean';
  if(!shape(prior)||!shape(next)||next.maxRows>prior.maxRows||
    (next.productionReads && !prior.productionReads)||
    (next.productionReads===prior.productionReads && next.maxRows===prior.maxRows))
    throw new TypeError('SQL read settings may only reduce row count or disable production reads');
  return {maxRows:next.maxRows,productionReads:next.productionReads};
}
