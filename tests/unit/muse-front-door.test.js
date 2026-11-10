// D-006 MC-8: the connection page tells people the one Muse Client ID, `muse`.
import {describe,it,expect} from 'vitest';
import {createConnectionPage} from '../../api/connection.js';
const render=()=>{const out={headers:{},body:'',statusCode:200};
 const res={setHeader:(k,v)=>{out.headers[k]=v;},getHeader:k=>out.headers[k],
  writeHead:(n,h={})=>{out.statusCode=n;Object.assign(out.headers,h);},
  end:b=>{out.body+=b??'';},statusCode:200,status(n){out.statusCode=n;return res;},send(b){out.body+=String(b);return res;}};
 createConnectionPage({env:{PUBLIC_BASE_URL:'https://neon.example.test'}})({method:'GET',headers:{}},res);return out;};
describe('Muse instruction on the connection page',()=>{
 it('says Client ID muse, Client Secret blank, with the long form as the older option',()=>{
  const {body}=render();
  expect(body).toContain('<code id="muse-client-id">muse</code>');
  expect(body).toContain('Client Secret: leave blank.');
  expect(body).toContain('https://neon.example.test/.well-known/muse-client.json');
  expect(body.indexOf('id="muse-client-id"')).toBeLessThan(body.indexOf('/.well-known/muse-client.json'));
 });
});
