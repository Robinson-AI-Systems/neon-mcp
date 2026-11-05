// Own-store transport: the one place that decides how the server's own
// database (OAuth registrations, tokens, enrolled keys, settings) is
// reached. Two drivers implement the exact same handle contract — a
// tagged-template query function that resolves to an array of row
// objects, plus a .query(text, values) method with the same row
// contract — so src/db.js and the health probe never know which store
// they are talking to:
//
//   neon — the @neondatabase/serverless HTTP driver. Used when
//     DATABASE_URL names a Neon endpoint (the Vercel deployment), and
//     the behavior production has always had; unchanged by this module.
//   pg — a pooled node-postgres client for a plain Postgres store (the
//     Development Rack). This is the test/helpers/pg-neon-adapter.js
//     pattern promoted into src/: the whole db test-suite already runs
//     the db layer through this exact query shape against local
//     Postgres, so the promotion lifts a proven seam, it does not
//     invent one.
//
// Selection: STORE_TRANSPORT=neon|pg wins when set; otherwise the
// DATABASE_URL hostname decides (a *.neon.tech host selects neon,
// anything else selects pg). The pg path never activates on Vercel,
// where the store URL is a Neon endpoint.
import { neon } from '@neondatabase/serverless';
import pg from 'pg';

export const STORE_TRANSPORTS = Object.freeze(['neon', 'pg']);

export function isNeonStoreUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().endsWith('.neon.tech');
  } catch {
    return false;
  }
}

export function selectStoreTransport(env = process.env) {
  const declared = String(env.STORE_TRANSPORT ?? '').trim().toLowerCase();
  if (declared) {
    if (!STORE_TRANSPORTS.includes(declared)) {
      throw new Error('STORE_TRANSPORT must be "neon" or "pg" when set.');
    }
    return declared;
  }
  return isNeonStoreUrl(env.DATABASE_URL) ? 'neon' : 'pg';
}

const pools = new Map();

function poolFor(url) {
  let pool = pools.get(url);
  if (!pool) {
    // A long-lived standalone process reuses one small pool per store
    // URL; the serverless driver needs no pool because each call is an
    // independent HTTP request.
    pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
    pools.set(url, pool);
  }
  return pool;
}

// The pg half of the handle contract. Rows come back as plain objects
// (node-postgres default), matching the Neon driver's row shape; pg
// error codes (e.g. 23505) ride the thrown error unchanged, as they do
// through the Neon driver.
export function pgStoreSql(url) {
  const pool = poolFor(url);
  const sql = async (strings, ...values) => {
    const text = strings.reduce((acc, part, i) => (i === 0 ? part : `${acc}$${i}${part}`), '');
    const { rows } = await pool.query(text, values);
    return rows;
  };
  sql.query = async (text, values = []) => (await pool.query(text, values)).rows;
  sql.end = async () => {
    pools.delete(url);
    await pool.end();
  };
  return sql;
}

// The own-store handle for a deployment environment. Throws the same
// configuration error src/db.js has always thrown when DATABASE_URL is
// absent.
export function storeSql(env = process.env) {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured. Set it in the Vercel project (docs/DEPLOY.md).');
  }
  return selectStoreTransport(env) === 'neon' ? neon(url) : pgStoreSql(url);
}
