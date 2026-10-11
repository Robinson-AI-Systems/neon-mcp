import {resultScope} from '../core/result-store.js';
import {pageStoredResult} from '../core/result-pages.js';
export const tools=[{
 name:'neon_get_result',
 description:'Read a stored, connection-scoped result by handle, one bounded page at a time.',
 writes:false,profiles:['read_only','everyday','full'],
 inputSchema:{type:'object',properties:{
  handle:{type:'string',pattern:'^res_[a-f0-9]{40}$'},
  page:{type:'integer',minimum:0,maximum:100000},
  pageSize:{type:'integer',minimum:1,maximum:50},
  fields:{type:'string',maxLength:512}},
  required:['handle'],additionalProperties:false},
 outputSchema:{type:'object',properties:{handle:{type:'string'},page:{type:'integer'}},
  required:['handle','page'],additionalProperties:true}
}];
export const handlers={
 async neon_get_result(args,{connection,db}){
  const scope=resultScope(connection);
  if(typeof db?.readResultHandle!=='function')throw new Error('Result storage unavailable');
  if(typeof args?.handle!=='string'||!/^res_[a-f0-9]{40}$/.test(args.handle))
   throw new TypeError('Invalid stored result handle');
  const stored=await db.readResultHandle({handle:args.handle,connection:scope});
  if(!stored)return {isError:true,content:[{type:'text',
   text:'This result handle is unavailable, expired, or belongs to another connection.'}]};
  const page=pageStoredResult(stored.body,{page:args.page??0,pageSize:args.pageSize??10,
   fields:args.fields});
  return {content:[{type:'text',text:JSON.stringify({
   handle:args.handle,summary:stored.summary,...page})}]};
 }
};
