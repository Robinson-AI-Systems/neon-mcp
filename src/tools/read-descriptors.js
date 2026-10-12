// Shared descriptors for scoped Neon reads. Handlers still enforce authorization.
export const readId={type:'string',pattern:'^[a-z0-9-]{1,60}$'};
export const readSchema=properties=>({type:'object',properties,additionalProperties:false});
export const readText=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
export function defineReadTool(name,description,properties,{area='projects',audience=['builder','owner','operator']}={}){
 return {name,description,writes:false,profiles:['read_only','everyday','full'],
  area,audience,inputSchema:readSchema(properties)};
}
