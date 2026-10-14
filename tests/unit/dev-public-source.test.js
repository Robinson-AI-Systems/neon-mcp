import {describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {checkedPublicSource,fetchPublicSource,isPublicIPv4,
 parseCsv,parsePublicRows,normalizePublicRows} from '../../src/dev/public-source.js';

const url='https://raw.githubusercontent.com/public-project/fixtures/main/demo.csv';
const csv='label,sku,price_cents,email\n"Demo, Washer",SKU-1,1000,washer@example.com\n'+
 'Demo Dryer,SKU-2,1200,dryer@example.com\n';
function httpStub({body=csv,status=200,headers={}}={}){
 const request=vi.fn((_url,opts,callback)=>{
  const req=new EventEmitter();
  req.end=()=>queueMicrotask(()=>{
   const response=new EventEmitter();
   response.statusCode=status;response.headers=headers;
   response.destroy=vi.fn();
   callback(response);
   if(status===200&&!response.destroy.mock.calls.length){
    response.emit('data',Buffer.isBuffer(body)?body:Buffer.from(body));
    response.emit('end');
   }
  });
  return req;
 });
 return request;
}
describe('V-2 secure bounded public source ingestion',()=>{
 it('rejects internal URLs, credentials, custom ports, redirects and dangerous IP families',()=>{
  for(const value of ['http://example.com/data.csv','https://localhost/x.csv',
   'https://169.254.169.254/file.json','https://user:pass@example.com/file.json',
   'https://example.com:8443/file.csv','https://box.internal/test.json',
   'https://example.com/file.txt','https://example.com/file.csv#fragment'])
   expect(()=>checkedPublicSource(value)).toThrow();
  for(const ip of ['10.0.0.1','127.0.0.1','172.16.3.4','192.168.1.1',
   '169.254.169.254','100.64.1.1','192.0.2.1','198.18.0.1',
   '203.0.113.4','224.0.0.1','::1'])
   expect(isPublicIPv4(ip),ip).toBe(false);
  expect(isPublicIPv4('185.199.108.133')).toBe(true);
 });
 it('pins a public verified address and never redirects or accepts compressed/oversized bodies',async()=>{
  const resolve=vi.fn(async()=>[{family:4,address:'185.199.108.133'}]);
  const request=httpStub();
  const source=await fetchPublicSource(url,{resolve,request});
  expect(source).toMatchObject({host:'raw.githubusercontent.com',kind:'csv',
   text:csv,byteLength:Buffer.byteLength(csv)});
  expect(source.sha256).toBe(createHash('sha256').update(csv).digest('hex'));
  expect(resolve).toHaveBeenCalledWith('raw.githubusercontent.com',{all:true});
  const opt=request.mock.calls[0][1],seen=vi.fn();
  opt.lookup('raw.githubusercontent.com',{},seen);
  expect(seen).toHaveBeenCalledWith(null,'185.199.108.133',4);
  expect(opt.agent).toBe(false);
  await expect(fetchPublicSource(url,{resolve,
   request:httpStub({status:301,headers:{location:'http://169.254.169.254'}})}))
   .rejects.toThrow('refused');
  await expect(fetchPublicSource(url,{resolve,
   request:httpStub({headers:{'content-encoding':'gzip'}})}))
   .rejects.toThrow('refused');
  await expect(fetchPublicSource(url,{resolve,
   request:httpStub({headers:{'content-length':'10485761'}})}))
   .rejects.toThrow('refused');
  await expect(fetchPublicSource(url,{resolve:async()=>[
   {family:4,address:'10.0.0.1'},{family:4,address:'185.199.108.133'}],request}))
   .rejects.toThrow('safely');
  expect(request).toHaveBeenCalledTimes(1);
 });
 it('accepts quoted RFC CSV fields and typed bounded JSON without real identity fields',()=>{
  const parsed=parseCsv(csv);
  expect(parsed).toEqual([
   {label:'Demo, Washer',sku:'SKU-1',price_cents:'1000',email:'washer@example.com'},
   {label:'Demo Dryer',sku:'SKU-2',price_cents:'1200',email:'dryer@example.com'}
  ]);
  const shaped=normalizePublicRows(parsed);
  expect(shaped.totalRows).toBe(2);
  expect(shaped.columns.map(x=>x.type)).toEqual([
   'integer','text','text','integer','text']);
  expect(shaped.rows[1]).toMatchObject({id:2,price_cents:1200,sku:'SKU-2'});
  expect(parsePublicRows({kind:'json',text:'[{"sku":"S-1","enabled":true}]'}))
   .toEqual([{sku:'S-1',enabled:true}]);
 });
 it('refuses ambiguous CSV syntax, PII columns, non-demo emails, unsafe phone and repeated IDs',()=>{
  for(const text of ['a,b\n"broken,b','a,b\n1','a,a\n1,2',
   'a,b\n1,2,3','a,b\r1,2'])
   expect(()=>parseCsv(text)).toThrow();
  for(const rows of [
   [{email:'someone@gmail.com'}],
   [{phone:'303-555-9999'}],
   [{password:'sekret'}],
   [{address:'123 Main St'}],
   [{id:123,name:'Demo'}],
   [{sku:'A'}, {sku:'A',second:'extra'}],
   [{first:'ok',second:{nested:true}}],
   [{first:'a'.repeat(257)}]
  ])expect(()=>normalizePublicRows(rows)).toThrow();
  expect(()=>parsePublicRows({kind:'json',text:'{"items":[]}'})).toThrow();
  expect(()=>parsePublicRows({kind:'json',text:'invalid'})).toThrow();
 });
});
