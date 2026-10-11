import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db;
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();});
afterAll(async()=>{await closeIsolatedSchema();});
it('isolates connection and audit reads to the selected organization',async()=>{
  await db.createAccessToken({accessToken:'fake-a',clientId:'fake-one',neonOrg:'org-A'});
  await db.createAccessToken({accessToken:'fake-b',clientId:'fake-two',neonOrg:'org-B'});
  expect((await db.listConnectionSummaries('org-A')).map(x=>x.client_id)).toEqual(['fake-one']);
  await db.recordWritePreview({orgId:'org-A',mode:'preview',tool:'neon_sample',
    target:'br-fake',summary:'Safe'});
  await db.recordWritePreview({orgId:'org-B',mode:'preview',tool:'neon_sample',
    target:'br-other',summary:'Safe'});
  expect(await db.listRecentChanges({orgId:'org-A'})).toEqual([]);
  const rows=await db.listRecentChanges({orgId:'org-A',includePreviews:true});
  expect(rows).toHaveLength(1);expect(rows[0].target).toBe('br-fake');
  expect(Object.keys(rows[0])).not.toContain('before');
});
it('returns only allowlisted settings and refuses unbounded reads',async()=>{
  const rows=await db.listSafeSettings();
  expect(rows.some(x=>x.key==='sql.read_policy')).toBe(true);
  expect(rows.every(x=>!x.key.startsWith('production_intent:'))).toBe(true);
  await expect(db.listConnectionSummaries('org-A',1000)).rejects.toThrow();
  await expect(db.listRecentChanges({orgId:'',limit:20})).rejects.toThrow();
});
