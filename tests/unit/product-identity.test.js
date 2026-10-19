import {describe,it,expect} from 'vitest';
import landing from '../../api/index.js';
import {createOAuthHandlers} from '../../src/core/oauth-handlers.js';
import {createSetupHandler} from '../../api/neon/setup.js';
import {registry} from '../../src/tools/index.js';
import {rtcManifest,rtcOpenApi} from '../../src/core/rtc-contract.js';
import {PRODUCT_DISPLAY_NAME,PRODUCT_ATTRIBUTION,MCP_TECHNICAL_ID} from '../../src/core/product-identity.js';

const response=()=>({
  headers:{},statusCode:200,body:undefined,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  send(value){this.body=value;return this;},
  json(value){this.body=value;return this;}
});
describe('independent Neon connection product attribution',()=>{
  it('uses one descriptive display name without replacing stable wire identity',()=>{
    expect(PRODUCT_DISPLAY_NAME).toBe('Neon by Robinson AI Systems');
    expect(PRODUCT_ATTRIBUTION).toMatch(/not an official Neon product or endorsement/);
    const r=response();landing({method:'GET'},r);
    expect(r.body).toMatchObject({name:PRODUCT_DISPLAY_NAME,
      description:PRODUCT_ATTRIBUTION,endpoint:'/api/mcp'});
    expect(r.body.status).not.toBe('connected');
    const manifest=rtcManifest(registry);
    expect(manifest).toMatchObject({server:MCP_TECHNICAL_ID,
      displayName:PRODUCT_DISPLAY_NAME,description:PRODUCT_ATTRIBUTION});
    expect(rtcOpenApi().info.title).toContain(PRODUCT_DISPLAY_NAME);
  });
  it('shows independent branding on genuine OAuth and owner-only setup surfaces',async()=>{
    const env={PUBLIC_BASE_URL:'https://mcp.example.test',ADMIN_PASSPHRASE:'FAKE_PASSWORD',
      VERCEL_ENV:'production'};
    const db={
      async getOAuthClient(){return {
        redirect_uris:['https://agent.example.test/callback'],client_name:'Fake agent'};},
      async listNeonOrgs(){return [];},
      async listNeonKeySummaries(){return [];}
    };
    const authorize=createOAuthHandlers({db,env}).authorize;
    const oauth=response();
    await authorize({method:'GET',query:{
      client_id:'fake-client',redirect_uri:'https://agent.example.test/callback',
      response_type:'code',code_challenge:'A'.repeat(43),
      code_challenge_method:'S256',resource:'https://mcp.example.test/api/mcp'
    }},oauth);
    expect(oauth.statusCode).toBe(200);
    expect(oauth.body).toContain('Connect '+PRODUCT_DISPLAY_NAME);
    expect(oauth.body).toContain(PRODUCT_ATTRIBUTION);
    const setup=createSetupHandler({db,vault:{},exchange:{},env});
    const page=response();
    await setup({method:'GET',headers:{},query:{}},page);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain(PRODUCT_DISPLAY_NAME+' secure setup');
    expect(page.body).toContain(PRODUCT_ATTRIBUTION);
    expect(page.body).not.toContain(env.ADMIN_PASSPHRASE);
  });
});
