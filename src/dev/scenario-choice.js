// V-2 deterministic, explainable offline matching; never use a model or fetch.
// Ambiguous or unmatched phrases refuse rather than guessing a database workload.
const words=Object.freeze({
 saas:['saas','software','subscription','subscriptions','billing','invoicing',
  'invoice','invoices','organization','organizations','software as a service'],
 store:['store','shop','shopping','retail','ecommerce','e-commerce','cart',
  'checkout','catalog','products','product','orders','order','refund','refunds'],
 rental:['rent','rental','rentals','lease','leases','leased','leasing',
  'appliance','appliances','washer','washers','dryer','dryers','equipment hire'],
 blog:['blog','blogs','article','articles','posts','post','author','authors',
  'comments','comment','publishing','publication','content management']
});
export const SUPPORTED_DEMOS=Object.freeze(Object.keys(words));
const escaped=value=>value.replace(/[.*+?^$()|[\]{}]/g,'\\$&');
function hits(text,keys){
 return keys.filter(word=>{
  const pattern=new RegExp('(?:^|[^a-z0-9])'+escaped(word)+
   '(?:$|[^a-z0-9])','i');
  return pattern.test(text);
 });
}
export function chooseDemoScenario({scenario,description}={}){
 if(scenario!==undefined&&description!==undefined)
  throw Error('Choose either a named demo or a plain description, not both');
 if(scenario!==undefined){
  if(!SUPPORTED_DEMOS.includes(scenario))throw Error('Unsupported synthetic scenario');
  return {scenario,matchedFromDescription:false,matchedTerms:[]};
 }
 if(typeof description!=='string'||description.length<5||
    description.length>400||!/[A-Za-z]{3}/.test(description)||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(description))
  throw Error('Provide a short safe description of the requested demo');
 const matches=Object.entries(words).map(([name,keywords])=>
  ({scenario:name,terms:hits(description,keywords)}))
  .filter(item=>item.terms.length>0);
 if(matches.length!==1)throw Error(matches.length?'Ambiguous demo description':
  'Description does not match a supported synthetic demo');
 return {scenario:matches[0].scenario,matchedFromDescription:true,
  matchedTerms:matches[0].terms.slice(0,4)};
}
