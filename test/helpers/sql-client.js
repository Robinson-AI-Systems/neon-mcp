// Only disposable localhost PostgreSQL may be opened by test SQL pools.
import pg from 'pg';
export function localPoolFactory({connectionString,...options}) {
  const host=new URL(connectionString).hostname;
  if(!['localhost','127.0.0.1','[::1]'].includes(host))
    throw new Error('Refusing a non-local test SQL pool');
  return new pg.Pool({connectionString,...options});
}
