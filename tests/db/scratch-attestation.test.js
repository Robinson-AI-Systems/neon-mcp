import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db;
const org='org-fake-scratch',project='proj-fake-scratch',other='proj-fake-other';
beforeAll(async()=>{
 await openIsolatedSchema(requireLocalDatabaseUrl());
 db=createDb(neonShapedQuery());await db.initSchema();
 await rawQuery('INSERT INTO neon_orgs (id,label) VALUES ($1,$2)',[org,'Fake']);
 await rawQuery(`INSERT INTO neon_keys
  (org_id,kind,project_id,key_enc,last4,reach)
  VALUES ($1,'project',$2,'FAKE_ENCRYPTED','abcd',$3::jsonb)`,
  [org,project,JSON.stringify({verified:true})]);
});
afterAll(async()=>await closeIsolatedSchema());
it('never infers unregistered or other-organization projects are non-app-managed',async()=>{
 expect(await db.getProjectAppOwnership({orgId:org,projectId:project})).toBeNull();
 expect(await db.getProjectAppOwnership({orgId:org,projectId:other})).toBeNull();
 expect(await db.getProjectAppOwnership({orgId:'org-other',projectId:project})).toBeNull();
 expect(await db.saveScratchAttestation({orgId:org,projectId:other,
  projectName:'Foreign project without key'})).toBe(false);
});
it('attests exactly an enrolled verified scoped key and instantly revokes trust',async()=>{
 const row={orgId:org,projectId:project,projectName:'Fake isolated scratch'};
 expect(await db.saveScratchAttestation(row)).toBe(true);
 expect(await db.getProjectAppOwnership({orgId:org,projectId:project}))
  .toEqual({verified:true,appOwned:false,evidence:'explicit_owner_scratch_attestation'});
 expect(await db.listScratchAttestations(org)).toMatchObject([
  {project_id:project,project_name:'Fake isolated scratch'}]);
 expect(await db.revokeScratchAttestation({orgId:'org-other',projectId:project})).toBe(false);
 expect(await db.revokeScratchAttestation({orgId:org,projectId:project})).toBe(true);
 expect(await db.revokeScratchAttestation({orgId:org,projectId:project})).toBe(false);
 expect(await db.getProjectAppOwnership({orgId:org,projectId:project})).toBeNull();
 expect(await db.saveScratchAttestation(row)).toBe(true);
 await rawQuery('UPDATE neon_keys SET revoked_at=now() WHERE org_id=$1 AND project_id=$2',
  [org,project]);
 expect(await db.getProjectAppOwnership({orgId:org,projectId:project})).toBeNull();
 expect(await db.saveScratchAttestation(row)).toBe(false);
});
