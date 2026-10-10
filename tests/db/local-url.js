// Database tests run only against throwaway localhost Postgres (scripts/local-postgres-test.sh) — never Neon.
export function requireLocalDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL must point to disposable localhost Postgres (run npm run test:db)');
  const { hostname } = new URL(raw);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) throw new Error('Refusing non-local Postgres in tests');
  return raw;
}
