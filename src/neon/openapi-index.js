// Pure OpenAPI operation catalog, independent of the test harness and runtime YAML parser.
const METHODS = ['get','post','patch','put','delete'];
export function indexNeonOperations(spec) {
  if (!spec || typeof spec !== 'object' || !spec.paths) throw new TypeError('A parsed OpenAPI document is required');
  const items = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = methods?.[method];
      if (!op?.operationId) continue;
      items.push(Object.freeze({ method: method.toUpperCase(), path, operationId: op.operationId,
        summary: String(op.summary || '').replace(/\s+/g,' ').trim().slice(0,160) }));
    }
  }
  return items.sort((a,b)=>a.operationId.localeCompare(b.operationId));
}
export function searchNeonOperations(items, query = '', {limit = 20} = {}) {
  if (!Array.isArray(items) || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new TypeError('Invalid OpenAPI search options');
  const words = String(query).toLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(item=>{
    const text = [item.method,item.path,item.operationId,item.summary].join(' ').toLowerCase();
    return words.every(word=>text.includes(word));
  }).slice(0,limit);
}
export function diffNeonOperations(oldItems,newItems) {
  const before = new Map(oldItems.map(x=>[x.method+' '+x.path,x]));
  const after = new Map(newItems.map(x=>[x.method+' '+x.path,x]));
  const added=[],removed=[],changed=[];
  for(const [key,item] of after) {
    if(!before.has(key)) added.push(item);
    else if(before.get(key).operationId !== item.operationId)
      changed.push({before:before.get(key),after:item});
  }
  for(const [key,item] of before) if(!after.has(key)) removed.push(item);
  return {added,removed,changed};
}
