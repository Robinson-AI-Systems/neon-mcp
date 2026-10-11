// B-5: safe, actionable Neon/PostgreSQL errors. No raw driver objects or credentials escape.
// Full nested result shaping and generic secret scrubber belong to B-6.
const sqlStates = Object.freeze({
  '42P01': ['missing_table','The table does not exist.','Check the table name and selected database.'],
  '42703': ['missing_column','The column does not exist.','Check the column name and migration state.'],
  '42501': ['sql_permission_denied','The database role lacks the required permission.','Use the correct role or request owner access.'],
  '23505': ['duplicate_value','A unique constraint would be violated.','Choose another value or check for an existing row.'],
  '23503': ['related_row_missing','A foreign-key relationship would be violated.','Create or retain the referenced row first.'],
  '23502': ['required_column_missing','A required column has no value.','Provide a value for each required column.'],
  '25006': ['read_only_violation','The read-only SQL transaction refused a change.','Use a separately authorized SQL write tool.'],
  '57014': ['sql_timeout','The SQL operation was cancelled or timed out.','Narrow the query and try again.'],
  '55P03': ['sql_lock_busy','The required database lock is busy.','Try again after the current operation finishes.'],
  '53300': ['too_many_connections','The database has too many active connections.','Use a pooled connection or reduce simultaneous queries.'],
  '28P01': ['sql_auth_failed','Database role authentication failed.','Verify the role through the owner setup page.'],
  '3D000': ['missing_database','The selected database does not exist.','Check the selected database name.'],
  '40001': ['serialization_conflict','Another transaction changed the data concurrently.','Review the current data before retrying.'],
  '40P01': ['deadlock','PostgreSQL detected a transaction deadlock.','Check transaction ordering before retrying.']
});
const safeId = s => typeof s === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(s) ? s : null;
const numberStatus = s => Number.isSafeInteger(Number(s)) && Number(s) >= 100 && Number(s) <= 599
  ? Number(s) : null;

// Bound any unknown provider text and remove credentials, even when nested in a URL/log.
export function redactErrorText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/(?:postgres(?:ql)?):\/\/[^\s'"<>]+/gi, '[redacted database connection]')
    .replace(/https?:\/\/[^\s'"<>]+/gi, '[redacted URL]')
    .replace(/\b(?:napi|npg|gh[pousr])_[A-Za-z0-9_-]{5,}\b/g, '[redacted credential]')
    .replace(/\b(?:bearer|basic)\s+[^\s'"<>]+/gi, '[redacted authorization]')
    .replace(/\b(?:password|passphrase|token|api[_-]?key|secret)\s*[:=]\s*[^\s,;]+/gi, '[redacted credential]')
    .replace(/[\r\n\t]/g, ' ')
    .slice(0, 180);
}
const safeUnknown = text => {
  const cleaned = redactErrorText(text);
  return cleaned && !/(?:authorization|credential|password|secret|token|key|\bselect\b|\binsert\b|\bdelete\b)/i.test(cleaned)
    ? cleaned : 'The provider returned an unexpected error.';
};
const detail = (code, message, action, technical, cause = null) =>
  Object.freeze({ code, message, cause: cause || message, action, technical });
const requestId = error => safeId(error?.request_id) || safeId(error?.requestId) ||
  safeId(error?.response?.headers?.get?.('x-request-id')) || null;
const statusOf = e => numberStatus(e?.status ?? e?.response?.status ?? e?.statusCode);
const kindFromPlan = text => {
  if (/branch.*(?:limit|maximum)|(?:limit|maximum).*branch/i.test(text)) return 'branch_limit';
  if (/compute.*(?:size|limit|maximum)|(?:limit|maximum).*compute/i.test(text)) return 'compute_limit';
  if (/project.*(?:limit|maximum)|(?:limit|maximum).*project/i.test(text)) return 'project_limit';
  if (/protected\s+branch/i.test(text)) return 'protected_branch_limit';
  return null;
};

/** Error is untrusted provider input; `needKey` is trusted tool metadata, not a provider hint. */
export function formatNeonError(error, { needKey = 'project' } = {}) {
  const status = statusOf(error);
  const raw = typeof error?.message === 'string' ? error.message : '';
  const plan = kindFromPlan(raw);
  const technical = 'Neon HTTP ' + (status ?? 'unknown') +
    (requestId(error) ? ' · request ' + requestId(error) : '');
  let issue, cause, action, code;
  if (plan) {
    code = plan;
    issue = 'The Neon plan or project configuration blocks this operation.';
    cause = 'A documented plan or protection limit was reached.';
    action = 'Review limits at https://console.neon.tech and request an owner-approved adjustment if needed.';
  } else if (/cannot delete.*branch.*children|branch.*has children/i.test(raw)) {
    code = 'branch_has_children'; issue = 'The branch still has child branches.';
    cause = 'Neon will not delete a parent branch while children remain.';
    action = 'Review the child branches; delete only verified, owner-approved children first.';
  } else {
    switch (status) {
      case 401: code='not_authenticated';issue='Neon rejected the API credential.';
        cause='The key may be revoked, expired or incorrect.';
        action='Add a valid key through the owner setup page.';break;
      case 403: code='not_authorized';issue='This Neon key cannot perform the requested operation.';
        cause='The operation requires broader account permissions.';
        action=needKey === 'organization' ?
          'Use a verified organization-scoped key, added through the owner setup page.' :
          'Verify the project-scoped key and your access on the owner setup page.';break;
      case 404: code='not_found';issue='Neon could not find the selected resource.';
        cause='The resource may have been deleted or the key may lack access.';
        action='Refresh the resource listing and verify project/branch scope.';break;
      case 409: case 423: code='operation_busy';issue='A Neon operation is already running.';
        cause='The project or branch is temporarily locked by another operation.';
        action='Wait and retry after checking neon_operation_list.';break;
      case 422: {
        code='invalid_parameter';issue='Neon rejected a request parameter.';
        const field = safeId(error?.field) || safeId(error?.parameter);
        cause=field ? 'Parameter ' + field + ' failed validation.' : 'One or more request values are unsupported.';
        action='Check the permitted values and resend a corrected preview.';break;
      }
      case 429: code='rate_limited';issue='Neon is receiving too many requests.';
        cause='The API rate limit was reached.';
        action='Wait for the documented limit to reset before retrying.';break;
      default: code='neon_api_error';issue=safeUnknown(raw);
        cause='The provider did not return a recognized HTTP status.';
        action='Review the operation state without automatically replaying an uncertain write.';
    }
  }
  return Object.freeze({ ...detail(code,issue,action,technical,cause), status });
}

/** SQLSTATE/driver code only; server never exposes query, role password or raw driver. */
export function formatSqlError(error) {
  const sqlstate = safeId(error?.code);
  const known = sqlstate && sqlStates[sqlstate];
  const disconnected = Boolean(sqlstate && (sqlstate.startsWith('08') ||
    ['ECONNRESET','EPIPE','ETIMEDOUT'].includes(sqlstate)));
  const technical = sqlstate && /^[A-Z0-9]{5,10}$/.test(sqlstate)
    ? 'SQLSTATE/driver ' + sqlstate : 'PostgreSQL error';
  if (known) return detail(known[0],known[1],known[2],technical);
  if (disconnected) return Object.freeze({
    ...detail('connection_reset','The database connection was interrupted.',
      'A read-only query can reconnect once; do not automatically replay a write.',technical),
    retryableRead: true
  });
  return detail('sql_failed',safeUnknown(error?.message),
    'Check the database, SQL statement, and permissions.',technical);
}
