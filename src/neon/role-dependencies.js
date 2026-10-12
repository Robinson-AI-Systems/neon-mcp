// D-4: global PostgreSQL role dependency and monitoring preflight.
// No provider deletion may rely on a guessed object owner or incomplete session view.
const roleName = x => typeof x === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(x);
const rows = async (query, statement, values = []) => {
  const result = await query(statement, values);
  if (!Array.isArray(result?.rows)) throw Error('PostgreSQL catalog evidence unavailable');
  return result.rows;
};
// PostgreSQL count columns are integer/string digits; coercing null, false, or ''
// to zero would falsely report an unobserved dependency as absent.
const count = x => {
  if (!(typeof x === 'number' && Number.isInteger(x)) &&
      !(typeof x === 'string' && /^\d+$/.test(x))) return null;
  const value = Number(x);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};
const validOid = x => count(x) !== null && count(x) > 0;
const validReference = x =>
  x && typeof x.database_oid === 'string' && /^\d+$/.test(x.database_oid) &&
  typeof x.object_catalog === 'string' && x.object_catalog.length > 0 &&
  x.object_catalog.length <= 128 &&
  typeof x.deptype === 'string' && /^[a-z]$/.test(x.deptype) &&
  count(x.amount) !== null;

/**
 * Probe from an independently scoped DIRECT compute connection with a monitor
 * role that can see every session. pg_shdepend covers every database in this
 * PostgreSQL cluster (not just current_database()).
 */
export async function inspectRoleDeletionDependencies(query, role) {
  if (typeof query !== 'function' || !roleName(role))
    throw Error('A verified PostgreSQL role and SQL client are required');
  let begun = false;
  try {
    await query('BEGIN READ ONLY');
    begun = true;
    await query('SET LOCAL statement_timeout = 15000');
    await query('SET LOCAL lock_timeout = 5000');
    const principal = await rows(query,
      'SELECT oid,rolname,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',
      [role]);
    if (principal.length !== 1 || principal[0].rolname !== role ||
        principal[0].rolsuper || principal[0].rolcreaterole ||
        principal[0].rolcreatedb || principal[0].rolreplication ||
        principal[0].rolbypassrls || !validOid(principal[0].oid))
      throw Error('Role is missing or elevated; deletion cannot be safely inspected');
    const view = await rows(query,
      "SELECT current_setting('is_superuser')='on' AS is_superuser, pg_has_role(current_user,'pg_read_all_stats','MEMBER') AS can_monitor");
    if (view.length !== 1 || (view[0].is_superuser !== true &&
        view[0].can_monitor !== true))
      throw Error('Complete active-session visibility is not independently available');
    const mode = await rows(query,
      "SELECT current_setting('transaction_read_only')='on' AS read_only");
    if (mode.length !== 1 || mode[0].read_only !== true)
      throw Error('PostgreSQL did not confirm a read-only transaction');
    const oid = principal[0].oid;
    const references = await rows(query,
      "SELECT dbid::text AS database_oid, classid::regclass::text AS object_catalog, deptype, count(*)::int AS amount FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=$1::oid GROUP BY dbid,classid,deptype ORDER BY dbid,classid,deptype LIMIT 101",
      [oid]);
    if (references.length > 100 || references.some(x=>!validReference(x)))
      throw Error('Complete global role reference inventory is unavailable');
    const databaseOwners = await rows(query,
      'SELECT datname FROM pg_database WHERE datdba=$1::oid ORDER BY datname LIMIT 101',
      [oid]);
    if (databaseOwners.length > 100 ||
        databaseOwners.some(x=>typeof x.datname!=='string'))
      throw Error('Database ownership inventory is incomplete');
    const memberships = await rows(query,
      'SELECT count(*)::int AS amount FROM pg_auth_members WHERE roleid=$1::oid OR member=$1::oid',
      [oid]);
    const activity = await rows(query,
      'SELECT count(*)::int AS sessions FROM pg_stat_activity WHERE usename=$1 AND pid<>pg_backend_pid()',
      [role]);
    if (memberships.length !== 1 || count(memberships[0].amount)===null ||
        activity.length !== 1 || count(activity[0].sessions)===null)
      throw Error('Role membership or sessions cannot be verified');
    const refs = references.reduce((n,x)=>n+Number(x.amount),0);
    if (!Number.isSafeInteger(refs))
      throw Error('Role dependency count is unavailable');
    // Repeat the session observation before COMMIT. An unstable inventory is
    // inconclusive even when its first sample happened to report zero.
    const finalActivity = await rows(query,
      'SELECT count(*)::int AS sessions FROM pg_stat_activity WHERE usename=$1 AND pid<>pg_backend_pid()',
      [role]);
    if (finalActivity.length !== 1 ||
        count(finalActivity[0].sessions) === null ||
        count(finalActivity[0].sessions) !== count(activity[0].sessions))
      throw Error('Role session inventory changed during inspection');
    await query('COMMIT');
    begun = false;
    const totals={objectReferences:refs,databaseOwnerships:databaseOwners.length,
      roleMemberships:Number(memberships[0].amount),
      activeSessions:Number(activity[0].sessions)};
    return {verified:true,role,clear:Object.values(totals).every(n=>n===0),
      readOnlyTransactionVerified:true,sessionSamples:2,
      totals,referenceTypes:references.map(x=>({
        databaseOid:x.database_oid,catalog:x.object_catalog,
        dependencyKind:x.deptype,count:Number(x.amount)
      })),databaseNames:databaseOwners.map(x=>x.datname),
      visibility:'global_role_references_and_complete_compute_sessions'};
  } catch {
    if (begun) { try { await query('ROLLBACK'); } catch { /* fail closed */ } }
    throw Error('Role dependencies or monitor visibility could not be completely verified');
  }
}
