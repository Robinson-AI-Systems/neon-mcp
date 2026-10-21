import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';

let db;
beforeAll(async()=>{
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());
  await db.initSchema();
});
afterAll(async()=>{await closeIsolatedSchema();});

it('stores explicit public clients without secrets and keeps legacy confidential records confidential',async()=>{
  await db.createOAuthClient({clientId:'public-native-a',tokenEndpointAuthMethod:'none',
    redirectUris:['https://native.example.test/callback']});
  expect(await db.getOAuthClient('public-native-a')).toMatchObject({
    client_secret_hash:null,token_endpoint_auth_method:'none'});
  await db.createOAuthClient({clientId:'legacy-confidential',clientSecret:'FAKE-client-secret',
    redirectUris:['https://native.example.test/callback']});
  await rawQuery("UPDATE oauth_clients SET data=data-'token_endpoint_auth_method' WHERE client_id=$1",['legacy-confidential']);
  const legacy=await db.getOAuthClient('legacy-confidential');
  expect(legacy.token_endpoint_auth_method).toBeUndefined();
  expect(legacy.client_secret_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(legacy)).not.toContain('FAKE-client-secret');
  await expect(db.createOAuthClient({clientId:'downgrade',clientSecret:'FAKE-client-secret',
    tokenEndpointAuthMethod:'none',redirectUris:['https://native.example.test/callback']})).rejects.toThrow();
});

it('claims codes only for their client and redirect; refresh is client-bound, atomic and scope preserving',async()=>{
  const redirect='https://native.example.test/callback';
  await db.createAuthCode({code:'FAKE-public-code',clientId:'public-native-a',redirectUri:redirect,
    codeChallenge:'a'.repeat(43),mode:'preview',profile:'full',listing:'compact'});
  expect(await db.consumeAuthCode('FAKE-public-code',{clientId:'public-native-b',redirectUri:redirect})).toBeNull();
  expect(await db.consumeAuthCode('FAKE-public-code',{clientId:'public-native-a',redirectUri:redirect+'/other'})).toBeNull();
  expect(await db.consumeAuthCode('FAKE-public-code',{clientId:'public-native-a',redirectUri:redirect}))
    .toMatchObject({client_id:'public-native-a',profile:'full',listing:'compact'});
  expect(await db.consumeAuthCode('FAKE-public-code')).toBeNull();
  await db.createAccessToken({accessToken:'FAKE-first-access',refreshToken:'FAKE-first-refresh',
    clientId:'public-native-a',mode:'preview',profile:'full',listing:'compact'});
  const rotate=(clientId,tag)=>db.rotateRefreshToken({refreshToken:'FAKE-first-refresh',
    clientId,accessToken:'FAKE-access-'+tag,newRefreshToken:'FAKE-refresh-'+tag});
  expect(await rotate('public-native-b','foreign')).toBeNull();
  const rotated=await Promise.all([rotate('public-native-a','one'),rotate('public-native-a','two')]);
  expect(rotated.filter(Boolean)).toHaveLength(1);
  expect(rotated.find(Boolean)).toMatchObject({client_id:'public-native-a',mode:'preview',profile:'full',listing:'compact'});
  expect(await db.getAccessToken('FAKE-first-access')).toBeNull();
  const winner=rotated[0]?'one':'two';
  expect(await db.revokeAccessToken('FAKE-access-'+winner)).toBe(true);
  expect(await db.getTokenByRefreshToken('FAKE-refresh-'+winner)).toBeNull();
});
