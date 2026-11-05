import { describe, it, expect } from 'vitest';
import { isNeonStoreUrl, selectStoreTransport, storeSql, pgStoreSql } from '../../src/db-transport.js';

const NEON_URL = 'postgres://fixture@ep-example-123.us-east-1.neon.tech/neondb';
const LOCAL_URL = 'postgres://localhost:5432/neondb';

describe('own-store transport selection', () => {
  it('classifies store URLs by hostname', () => {
    expect(isNeonStoreUrl(NEON_URL)).toBe(true);
    expect(isNeonStoreUrl('postgres://db.branch-1.eu-central-1.neon.tech/neondb')).toBe(true);
    expect(isNeonStoreUrl(LOCAL_URL)).toBe(false);
    expect(isNeonStoreUrl('postgres://rack-postgres:5432/neon_mcp_production')).toBe(false);
    expect(isNeonStoreUrl('postgres://evilneon.tech/neondb')).toBe(false);
    expect(isNeonStoreUrl('not a url')).toBe(false);
    expect(isNeonStoreUrl(undefined)).toBe(false);
  });

  it('defaults by DATABASE_URL host: Neon endpoints keep the Neon driver', () => {
    expect(selectStoreTransport({ DATABASE_URL: NEON_URL })).toBe('neon');
    expect(selectStoreTransport({ DATABASE_URL: LOCAL_URL })).toBe('pg');
  });

  it('lets an explicit STORE_TRANSPORT win, and refuses unknown values', () => {
    expect(selectStoreTransport({ DATABASE_URL: NEON_URL, STORE_TRANSPORT: 'pg' })).toBe('pg');
    expect(selectStoreTransport({ DATABASE_URL: LOCAL_URL, STORE_TRANSPORT: 'Neon' })).toBe('neon');
    expect(() => selectStoreTransport({ DATABASE_URL: LOCAL_URL, STORE_TRANSPORT: 'sqlite' }))
      .toThrow(/STORE_TRANSPORT must be "neon" or "pg"/);
  });

  it('keeps the legacy missing-DATABASE_URL error verbatim', () => {
    expect(() => storeSql({})).toThrow(
      'DATABASE_URL is not configured. Set it in the Vercel project (docs/DEPLOY.md).');
  });

  it('builds handles with the shared contract without opening a connection', async () => {
    const neonHandle = storeSql({ DATABASE_URL: NEON_URL });
    expect(typeof neonHandle).toBe('function');
    expect(typeof neonHandle.query).toBe('function');
    const pgHandle = storeSql({ DATABASE_URL: LOCAL_URL });
    expect(typeof pgHandle).toBe('function');
    expect(typeof pgHandle.query).toBe('function');
    expect(typeof pgHandle.end).toBe('function');
    await pgHandle.end();
    const direct = pgStoreSql(LOCAL_URL);
    expect(typeof direct).toBe('function');
    await direct.end();
  });

  it('ends a shared pool once even when several handles end it', async () => {
    const url = 'postgres://localhost:5433/neondb';
    const first = pgStoreSql(url);
    const second = pgStoreSql(url);
    await first.end();
    await second.end();
    await first.end();
  });
});
