import { describe, it, expect } from 'vitest';
import { formatNeonError, formatSqlError, redactErrorText } from '../../src/neon/errors.js';

describe('B-5 safe, actionable Neon API errors', () => {
  const cases = [
    [401,'not_authenticated','setup page'],
    [403,'not_authorized','setup page'],
    [404,'not_found','Refresh'],
    [409,'operation_busy','neon_operation_list'],
    [423,'operation_busy','neon_operation_list'],
    [422,'invalid_parameter','corrected preview'],
    [429,'rate_limited','Wait']
  ];
  it.each(cases)('maps HTTP %i without returning provider secrets', (status, code, action) => {
    const result = formatNeonError({ status,
      message: 'postgresql://fake:FAKE-password@localhost/db bearer FAKEtoken' });
    expect(result).toMatchObject({ code, status });
    expect(result.action).toContain(action);
    expect(result).toHaveProperty('cause');
    expect(result.technical).toBe('Neon HTTP ' + status);
    expect(JSON.stringify(result)).not.toMatch(/FAKE-password|FAKEtoken|postgresql:\/\//);
  });
  it('allows only trusted key metadata and safe parameter/Neon request identifiers', () => {
    const refused = formatNeonError({ status: 403 }, { needKey: 'organization' });
    expect(refused.action).toContain('organization-scoped');
    const invalid = formatNeonError({ status: 422,
      field: 'branch_id', requestId: 'req-fake-001' });
    expect(invalid.cause).toContain('branch_id');
    expect(invalid.technical).toContain('req-fake-001');
    const malicious = formatNeonError({ status: 422,
      field: 'branch_id\npostgresql://fake:FAKE-pass@localhost/db',
      requestId: 'req-bad token' });
    expect(JSON.stringify(malicious)).not.toMatch(/FAKE-pass|req-bad token/);
  });
  it('recognizes plan limits and parent branches that have children', () => {
    for (const [error, expected] of [
      ['Branch limit reached', 'branch_limit'],
      ['Compute size maximum exceeded', 'compute_limit'],
      ['Project maximum reached', 'project_limit'],
      ['Cannot create on protected branch', 'protected_branch_limit'],
      ['Cannot delete branch that has children', 'branch_has_children']
    ]) {
      expect(formatNeonError({ status: 422, message: error }).code).toBe(expected);
    }
  });
  it('retains only bounded, redacted safe unknown errors', () => {
    const safe = formatNeonError({ status: 500, message: 'Neon is unavailable.' });
    expect(safe.message).toBe('Neon is unavailable.');
    const risky = formatNeonError({ status: 500,
      message: 'password=FAKEsecret-because SQL DELETE FROM invoices' });
    expect(risky.message).toBe('The provider returned an unexpected error.');
    const clipped = redactErrorText('x'.repeat(2000));
    expect(clipped).toHaveLength(180);
  });
});

describe('B-5 PostgreSQL SQLSTATE errors and controlled reconnection', () => {
  const pairs = [
    ['42P01','missing_table'],['42703','missing_column'],['42501','sql_permission_denied'],
    ['23505','duplicate_value'],['23503','related_row_missing'],
    ['23502','required_column_missing'],['25006','read_only_violation'],
    ['57014','sql_timeout'],['55P03','sql_lock_busy'],['53300','too_many_connections'],
    ['28P01','sql_auth_failed'],['3D000','missing_database'],
    ['40001','serialization_conflict'],['40P01','deadlock']
  ];
  it.each(pairs)('normalizes SQLSTATE %s', (state, expected) => {
    const result = formatSqlError({ code: state,
      message: 'postgresql://fake:FAKE-password@localhost/db' });
    expect(result.code).toBe(expected);
    expect(result.technical).toContain(state);
    expect(JSON.stringify(result)).not.toMatch(/FAKE-password|postgresql:\/\//);
  });
  it('identifies recoverable SQL disconnects; all other failures are not auto-retryable', () => {
    for (const state of ['08006','08003','ECONNRESET','EPIPE','ETIMEDOUT'])
      expect(formatSqlError({ code: state }).retryableRead).toBe(true);
    expect(formatSqlError({ code: '40001' }).retryableRead).toBeUndefined();
    expect(formatSqlError({ code: '42P01' }).retryableRead).toBeUndefined();
  });
  it('does not echo query or credentials in unknown SQL failures', () => {
    const result = formatSqlError({ code: '99999',
      message: 'SELECT secret FROM invoices password=FAKEpassword' });
    expect(JSON.stringify(result)).not.toMatch(/FAKEpassword|SELECT secret/);
  });
});
