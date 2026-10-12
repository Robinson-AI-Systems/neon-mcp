// D-4: bounded transactional SELECT/default-privilege grants. The caller must
// supply a server-owned, independently scoped PostgreSQL query function.
// Never describe a role as read-only before catalog verification succeeds.
const ident = value => typeof value === 'string' &&
  /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value);
const quote = value => {
  if (!ident(value)) throw Error('Invalid PostgreSQL identifier');
  return '"' + value + '"';
};
const rows = async (query, text, params = []) => {
  const response = await query(text, params);
  if (!Array.isArray(response?.rows)) throw Error('PostgreSQL catalog verification unavailable');
  return response.rows;
};

export async function grantReadOnlyPrivileges(query, { reader, owner, schemas } = {}) {
  if (typeof query !== 'function' || !ident(reader) || !ident(owner) ||
      reader === owner || !Array.isArray(schemas) ||
      schemas.length === 0 || schemas.length > 8 ||
      new Set(schemas).size !== schemas.length || schemas.some(s => !ident(s) ||
        s === 'pg_catalog' || s === 'information_schema' || s.startsWith('pg_')))
    throw Error('Provide a distinct role, verified owner and one to eight user schemas');
  let begun = false, committing = false;
  try {
    await query('BEGIN');
    begun = true;
    await query('SET LOCAL lock_timeout = 5000');
    await query('SET LOCAL statement_timeout = 15000');
    const principals = await rows(query,
      'SELECT rolname, oid, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = ANY($1::text[])',
      [[reader, owner]]);
    const byName = new Map(principals.map(x => [x.rolname, x]));
    const account = byName.get(reader), grantor = byName.get(owner);
    if (!account || !grantor || account.rolsuper || account.rolcreaterole ||
        account.rolcreatedb || account.rolreplication || account.rolbypassrls)
      throw Error('Role or grant owner could not be independently verified');
    const memberships = await rows(query,
      'SELECT count(*)::int AS total FROM pg_auth_members WHERE member = $1::oid',
      [account.oid]);
    if (memberships.length !== 1 || Number(memberships[0].total) !== 0)
      throw Error('Role has inherited membership that can provide write access');
    const namespaces = await rows(query,
      'SELECT n.oid, n.nspname, r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname = ANY($1::text[])',
      [schemas]);
    if (namespaces.length !== schemas.length ||
        namespaces.some(n => n.owner !== owner))
      throw Error('Every selected schema must have the independently verified owner');
    const objects = await rows(query,
      "SELECT n.nspname, c.relname, r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m','f')",
      [schemas]);
    if (objects.some(o => o.owner !== owner))
      throw Error('A selected relation belongs to another owner; do not make a partial grant');
    for (const schema of schemas) {
      await query('GRANT USAGE ON SCHEMA ' + quote(schema) + ' TO ' + quote(reader));
      await query('GRANT SELECT ON ALL TABLES IN SCHEMA ' + quote(schema) + ' TO ' + quote(reader));
      await query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + quote(owner) +
        ' IN SCHEMA ' + quote(schema) + ' GRANT SELECT ON TABLES TO ' + quote(reader));
    }
    const current = await rows(query,
      "SELECT n.nspname, c.relname, has_table_privilege($1::text,c.oid,'SELECT') AS can_read, has_table_privilege($1::text,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_write FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($2::text[]) AND c.relkind IN ('r','p','v','m','f')",
      [reader, schemas]);
    const defaults = await rows(query,
      "SELECT n.nspname, EXISTS (SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclnamespace=n.oid AND d.defaclrole=$1::oid AND d.defaclobjtype='r' AND a.grantee=$2::oid AND a.privilege_type='SELECT') AS can_read_future FROM pg_namespace n WHERE n.nspname=ANY($3::text[])",
      [grantor.oid, account.oid, schemas]);
    const creates = await rows(query,
      "SELECT n.nspname, has_schema_privilege($1::text,n.oid,'CREATE') AS can_create FROM pg_namespace n WHERE n.nspname=ANY($2::text[])",
      [reader, schemas]);
    if (current.length !== objects.length ||
        current.some(x => x.can_read !== true || x.can_write !== false) ||
        defaults.length !== schemas.length ||
        defaults.some(x => x.can_read_future !== true) ||
        creates.length !== schemas.length || creates.some(x => x.can_create !== false))
      throw Error('Read-only privileges or future-table defaults could not be verified');
    committing = true;
    await query('COMMIT');
    begun = false;
    return { verified: true, role: reader, owner, schemas: [...schemas],
      existingRelations: current.length, futureTablesForOwnerVerified: true };
  } catch {
    if (begun && !committing) {
      try { await query('ROLLBACK'); } catch { /* transaction may be uncertain */ }
    }
    throw Error('Read-only grants were not fully verified; inspect PostgreSQL before retrying');
  }
}
