// Pure, fail-closed PostgreSQL AST classification. Never executes SQL or opens a connection.
// B-3 first slice: no MCP tools are exposed until the guarded runner and owner gate exist.
import { parse } from 'libpg-query';

const levels = Object.freeze({ read: 0, write: 1, ddl: 2, destructive: 3, refused: 4 });
const ddl = new Set([
  'CreateStmt', 'ViewStmt', 'CreateFunctionStmt', 'CreateSchemaStmt',
  'CommentStmt', 'CreatePublicationStmt', 'CreateEnumStmt',
  'CompositeTypeStmt', 'CreateSeqStmt', 'CreateTrigStmt',
  'CreatePolicyStmt', 'CreateTableAsStmt'
]);
const destructive = new Set([
  'DropStmt', 'TruncateStmt', 'RenameStmt', 'DropOwnedStmt',
  'ReassignOwnedStmt', 'DoStmt', 'CallStmt', 'ClusterStmt',
  'AlterPolicyStmt', 'AlterSeqStmt'
]);
const refused = new Map([
  ['TransactionStmt', 'Transactions are managed by the SQL runner.'],
  ['VariableSetStmt', 'Use the bounded transaction settings instead of arbitrary SET.'],
  ['AlterSystemStmt', 'Server configuration changes are not supported.'],
  ['CreateRoleStmt', 'Use neon_role_* for role changes and one-time secrets.'],
  ['AlterRoleStmt', 'Use neon_role_* for role changes and one-time secrets.'],
  ['DropRoleStmt', 'Use neon_role_* for role changes and one-time secrets.'],
  ['CopyStmt', 'COPY is not available from guarded SQL tools.'],
  ['LoadStmt', 'LOAD is not available from guarded SQL tools.'],
  ['CheckPointStmt', 'CHECKPOINT is not available from guarded SQL tools.'],
  ['ListenStmt', 'LISTEN is not available from guarded SQL tools.'],
  ['NotifyStmt', 'NOTIFY is not available from guarded SQL tools.'],
  ['CreatedbStmt', 'Use neon_database_* for database operations.'],
  ['DropdbStmt', 'Use neon_database_* for database operations.'],
  ['CreateExtensionStmt', 'Use neon_schema_enable_extension.'],
  ['AlterExtensionStmt', 'Use neon_schema_enable_extension with update: true.'],
  ['DropExtensionStmt', 'Use neon_schema_*_extension tools.'],
  ['ReindexStmt', 'Use neon_health_reindex.']
]);
const forbiddenFunctions = new Map([
  ['pg_terminate_backend', 'Use neon_sql_stop_query.'],
  ['pg_cancel_backend', 'Use neon_sql_stop_query.'],
  ['pg_reload_conf', 'Server configuration changes are not supported.'],
  ['set_config', 'Changing settings from SQL is not supported.'],
  ['lo_import', 'Server file operations are not supported.'],
  ['lo_export', 'Server file operations are not supported.'],
  ['pg_read_file', 'Server file operations are not supported.'],
  ['pg_read_binary_file', 'Server file operations are not supported.'],
  ['pg_ls_dir', 'Server file operations are not supported.']
]);
const stateChangingFunctions = new Set([
  'setval', 'pg_create_logical_replication_slot', 'pg_stat_statements_reset'
]);

const deny = (reason) => Object.freeze({
  classification: 'refused', kind: 'refused', fullTable: false,
  access: false, unknownNode: false, reason
});
function nodeKind(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0].endsWith('Stmt') ? keys[0] : null;
}
function constant(node) {
  const c = node?.A_Const;
  if (!c) return null;
  const n = c.ival?.ival;
  if (Number.isSafeInteger(n)) return n;
  if (typeof c.boolval?.boolval === 'boolean') return c.boolval.boolval;
  if (typeof c.fval?.fval === 'string') return Number(c.fval.fval);
  return null;
}
function isAlwaysTrue(node) {
  if (constant(node) === true) return true;
  const expression = node?.A_Expr;
  const operation = expression?.name?.map(x => x.String?.sval).join('');
  if (operation === '=' && constant(expression.lexpr) !== null &&
      constant(expression.lexpr) === constant(expression.rexpr)) return true;
  const bool = node?.BoolExpr;
  if (bool?.boolop === 'AND_EXPR' && bool.args?.length)
    return bool.args.every(isAlwaysTrue);
  if (bool?.boolop === 'OR_EXPR' && bool.args?.length)
    return bool.args.some(isAlwaysTrue);
  return false;
}
function statementClass(type, body) {
  if (refused.has(type)) return { kind: 'refused', reason: refused.get(type) };
  if (destructive.has(type)) return { kind: 'destructive' };
  if (ddl.has(type)) return { kind: 'ddl' };
  if (type === 'SelectStmt')
    return { kind: body.intoClause || body.lockingClause?.length ? 'write' : 'read' };
  if (type === 'VariableShowStmt') return { kind: 'read' };
  if (type === 'ExplainStmt') return { kind: 'read' }; // Inner statement always visited.
  if (['InsertStmt', 'MergeStmt', 'RefreshMatViewStmt'].includes(type))
    return { kind: 'write' };
  if (['DeleteStmt', 'UpdateStmt'].includes(type)) {
    const fullTable = !body.whereClause || isAlwaysTrue(body.whereClause);
    return { kind: fullTable ? 'destructive' : 'write', fullTable };
  }
  if (type === 'IndexStmt')
    return body.concurrent ? { kind: 'refused', reason: 'Use neon_schema_create_index for CONCURRENTLY.' } :
      { kind: 'ddl' };
  if (type === 'GrantStmt')
    return { kind: body.isGrant === false ? 'destructive' : 'ddl', access: true };
  if (type === 'VacuumStmt') {
    const isFull = body.options?.some(x => x.DefElem?.defname?.toLowerCase() === 'full');
    return isFull ? { kind: 'destructive' } :
      { kind: 'refused', reason: 'Use neon_health_vacuum_analyze.' };
  }
  if (type === 'AlterEnumStmt')
    return { kind: body.newVal && !body.oldVal ? 'ddl' : 'destructive' };
  if (type === 'AlterTableStmt') {
    const allow = new Set(['AT_AddColumn', 'AT_AddColumnToView', 'AT_AddConstraint',
      'AT_AddConstraintRecurse', 'AT_ColumnDefault', 'AT_AttachPartition',
      'AT_EnableRowSecurity']);
    const commands = body.cmds || [];
    return { kind: commands.length && commands.every(x =>
      allow.has(x.AlterTableCmd?.subtype)) ? 'ddl' : 'destructive' };
  }
  return { kind: 'destructive', unknownNode: true,
    reason: 'Unclassified PostgreSQL statement: requires review and destructive confirmation.' };
}
function functionDecision(call) {
  const parts = call.funcname?.map(x => x.String?.sval).filter(Boolean) || [];
  const name = parts.at(-1)?.toLowerCase();
  if (!name) return null;
  if (forbiddenFunctions.has(name)) return { kind: 'refused', reason: forbiddenFunctions.get(name) };
  if (name.startsWith('pg_advisory_lock') || name.startsWith('dblink'))
    return { kind: 'refused', reason: 'Advisory locks and remote SQL are not supported.' };
  if (name === 'pg_sleep') {
    const seconds = call.args?.length === 1 ? constant(call.args[0]) : null;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds > 5 || seconds < 0)
      return { kind: 'refused', reason: 'pg_sleep must use a literal duration of at most five seconds.' };
  }
  if (name === 'pg_drop_replication_slot') return { kind: 'destructive' };
  if (stateChangingFunctions.has(name) || name.startsWith('pg_stat_reset'))
    return { kind: 'write' };
  return null;
}

/**
 * Classify exactly one SQL statement from libpg-query's parsed AST.
 * A nested statement may only strengthen the parent class. Unknown statements fail closed.
 * Values are never interpolated and text is never included in errors.
 */
export async function classifySql(sql) {
  if (typeof sql !== 'string' || !sql.trim())
    return deny('Provide exactly one PostgreSQL statement.');
  let parsed;
  try { parsed = await parse(sql); }
  catch { return deny('SQL cannot be parsed by PostgreSQL.'); }
  if (!Array.isArray(parsed?.stmts) || parsed.stmts.length !== 1)
    return deny('Provide exactly one PostgreSQL statement.');
  const root = parsed.stmts[0]?.stmt;
  if (!nodeKind(root)) return deny('Unsupported PostgreSQL statement.');
  let best = { kind: 'read' }, fullTable = false, access = false, unknownNode = false;
  const seen = new WeakSet();
  function walk(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const type = nodeKind(node);
    if (type) {
      const outcome = statementClass(type, node[type]);
      if (levels[outcome.kind] > levels[best.kind]) best = outcome;
      fullTable ||= outcome.fullTable === true;
      access ||= outcome.access === true;
      unknownNode ||= outcome.unknownNode === true;
    }
    if (node.FuncCall) {
      const fn = functionDecision(node.FuncCall);
      if (fn && levels[fn.kind] > levels[best.kind]) best = fn;
    }
    for (const child of Object.values(node)) walk(child);
  }
  walk(root);
  return Object.freeze({
    classification: best.kind, kind: best.kind, fullTable, access, unknownNode,
    reason: best.reason || null
  });
}
