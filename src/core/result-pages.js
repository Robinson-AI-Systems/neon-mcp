// Consistent 0-based, bounded result pages. A large item falls back to lossless JSON byte fragments.
import {projectFields} from './result-rules.js';
const fragmentBytes=4096;
export function pageStoredResult(body,{page=0,pageSize=10,fields}={}){
 if(!Number.isSafeInteger(page)||page<0||page>100000||
   !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)
   throw new TypeError('Page must be nonnegative and pageSize from 1 to 50');
 const selected=fields===undefined?body:projectFields(body,fields);
 const entries=selected && typeof selected==='object' && !Array.isArray(selected)
   ?Object.entries(selected):[];
 const arr=Array.isArray(selected)?selected:entries.find(([name,val])=>
   Array.isArray(val) && !['unknownFields'].includes(name))?.[1];
 const source=Array.isArray(selected)?'root':entries.find(([name,val])=>val===arr)?.[0]??null;
 if(arr){
   const offset=page*pageSize;
   const result={format:'items',source,page,pageSize,total:arr.length,
     items:arr.slice(offset,offset+pageSize),
     nextPage:offset+pageSize<arr.length?page+1:null};
   if(Buffer.byteLength(JSON.stringify(result))<=6000)return result;
 }
 // Never truncate a large object or one oversized list item without a continuation.
 const bytes=Buffer.from(JSON.stringify(selected),'utf8');
 const totalPages=Math.ceil(bytes.length/fragmentBytes)||1;
 const part=bytes.subarray(page*fragmentBytes,Math.min(bytes.length,(page+1)*fragmentBytes));
 return {format:'base64-json-fragment',page,totalPages,encoding:'base64',
   fragment:part.toString('base64'),nextPage:page+1<totalPages?page+1:null,
   instructions:'Decode and concatenate fragments in page order, then parse the complete JSON.'};
}
