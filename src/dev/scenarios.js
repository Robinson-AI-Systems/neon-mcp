// V-2 deterministic, synthetic-only demo scenario source.
// This is a read-only preview library. Nothing here executes SQL or contacts Neon.
const defs=Object.freeze({
 saas:{description:'Organizations, users, plans, subscriptions and invoices',
  tables:[
   ['organizations',[],['id','name','slug']],
   ['users',['organizations'],['id','organization_id','email','display_name']],
   ['plans',[],['id','name','monthly_cents']],
   ['subscriptions',['organizations','plans'],['id','organization_id','plan_id','status']],
   ['invoices',['subscriptions'],['id','subscription_id','amount_cents','issued_on']]
  ]},
 store:{description:'Customers, products, orders, order items and refunds',
  tables:[
   ['customers',[],['id','email','display_name']],
   ['products',[],['id','sku','name','price_cents']],
   ['orders',['customers'],['id','customer_id','ordered_on','status']],
   ['order_items',['orders','products'],['id','order_id','product_id','quantity']],
   ['refunds',['orders'],['id','order_id','amount_cents','reason']]
  ]},
 rental:{description:'Customers, rental items, agreements, payments and service visits',
  tables:[
   ['customers',[],['id','email','phone']],
   ['items',[],['id','serial','name','monthly_cents']],
   ['agreements',['customers','items'],['id','customer_id','item_id','starts_on']],
   ['payments',['agreements'],['id','agreement_id','amount_cents','paid_on']],
   ['service_visits',['agreements'],['id','agreement_id','scheduled_on','status']]
  ]},
 blog:{description:'Authors, posts, comments, tags and post-tag assignments',
  tables:[
   ['authors',[],['id','email','pen_name']],
   ['posts',['authors'],['id','author_id','title','published_on']],
   ['comments',['posts','authors'],['id','post_id','author_id','body']],
   ['tags',[],['id','slug','label']],
   ['post_tags',['posts','tags'],['id','post_id','tag_id']]
  ]}
});
export const SCENARIO_NAMES=Object.freeze(Object.keys(defs));
const validSeed=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s);
const countOk=n=>Number.isSafeInteger(n)&&n>=1&&n<=100;
const base=s=>{let n=2166136261;for(const c of s){n=Math.imul(n^c.charCodeAt(0),16777619);}return n>>>0;};
const ticket=(seed,table,i)=>base(seed+':'+table+':'+i)%1000;
const rowFor=(scenario,table,i,seed)=>{
 const id=i+1,ref=id,v=ticket(seed,table,i),day='2024-01-'+String(i%28+1).padStart(2,'0');
 const email=(type)=>type+'-'+id+'-'+v+'@example.com';
 const common={id};
 const obj={
  organizations:{name:'Example Organization '+id,slug:'example-org-'+id+'-'+v},
  users:{organization_id:ref,email:email('member'),display_name:'Sample Member '+id},
  plans:{name:'Demo Plan '+id,monthly_cents:1000+v},
  subscriptions:{organization_id:ref,plan_id:ref,status:'active'},
  invoices:{subscription_id:ref,amount_cents:1000+v,issued_on:day},
  customers:{email:email('customer'),display_name:'Sample Customer '+id,
   phone:'+1-202-555-'+String(100+v%100).padStart(4,'0')},
  products:{sku:'DEMO-'+id+'-'+v,name:'Demo Product '+id,price_cents:750+v},
  orders:{customer_id:ref,ordered_on:day,status:'placed'},
  order_items:{order_id:ref,product_id:ref,quantity:1+v%3},
  refunds:{order_id:ref,amount_cents:100+v,reason:'Sample adjustment'},
  items:{serial:'DEMO-ITEM-'+id+'-'+v,name:'Sample Rental '+id,monthly_cents:2000+v},
  agreements:{customer_id:ref,item_id:ref,starts_on:day},
  payments:{agreement_id:ref,amount_cents:2000+v,paid_on:day},
  service_visits:{agreement_id:ref,scheduled_on:day,status:'scheduled'},
  authors:{email:email('author'),pen_name:'Example Author '+id},
  posts:{author_id:ref,title:'Synthetic Post '+id+'-'+v,published_on:day},
  comments:{post_id:ref,author_id:ref,body:'Synthetic comment '+id+'-'+v},
  tags:{slug:'sample-tag-'+id+'-'+v,label:'Sample Tag '+id},
  post_tags:{post_id:ref,tag_id:ref}
 };
 // Names shared by scenarios resolve to the same shape only when appropriate.
 if(table==='customers'&&scenario==='rental')
  return {id,email:email('renter'),phone:'+1-202-555-'+String(100+v%100).padStart(4,'0')};
 return {...common,...obj[table]};
};
export function listDemoScenarios(){
 return SCENARIO_NAMES.map(name=>({
  name,description:defs[name].description,
  tables:defs[name].tables.map(([table,dependsOn,columns])=>({
   name:table,dependsOn:[...dependsOn],columns:[...columns]
  }))
 }));
}
export function planDemoScenario({scenario,rowsPerTable=3,seed='demo'}={}){
 if(!Object.hasOwn(defs,scenario))throw TypeError('Unknown demo scenario');
 if(!countOk(rowsPerTable)||!validSeed(seed))throw TypeError('Bounded row count and deterministic seed required');
 const tables=defs[scenario].tables.map(([name,dependsOn,columns])=>{
  const sample=Array.from({length:Math.min(3,rowsPerTable)},
   (_,i)=>rowFor(scenario,name,i,seed));
  for(const r of sample)if(columns.some(c=>!Object.hasOwn(r,c)))
   throw Error('Scenario column coverage mismatch: '+name);
  return {name,dependsOn:[...dependsOn],columns:[...columns],
   rows:rowsPerTable,sample};
 });
 const actual=new Set();
 for(const t of tables){
  if(t.dependsOn.some(dep=>!actual.has(dep)))
   throw Error('Scenario tables are not in dependency order');
  actual.add(t.name);
 }
 return {scenario,seed,rowsPerTable,syntheticOnly:true,execution:'none',
  tableCount:tables.length,totalRows:tables.length*rowsPerTable,tables,
  caveat:'Preview only: no database connection, SQL execution, schema creation or writes.'};
}
export function generateDemoRows({scenario,rowsPerTable=3,seed='demo'}={}){
 const preview=planDemoScenario({scenario,rowsPerTable,seed});
 return preview.tables.map(t=>({...t,rows:Array.from({length:rowsPerTable},
  (_,i)=>rowFor(scenario,t.name,i,seed))}));
}
