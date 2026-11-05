// RACK-2 companion proof: the rack store-init command fails closed and
// legibly when the store is not configured (its success path is the db
// suite's initSchema proof plus the rack rehearsal, not a unit test).
import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'rack-init-store.mjs');

describe('rack-init-store', () => {
  it('exits non-zero with the configuration error when DATABASE_URL is absent', async () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    await expect(run(process.execPath, [script], { env })).rejects.toMatchObject({ code: 1 });
    try {
      await run(process.execPath, [script], { env });
    } catch (error) {
      expect(String(error.stderr)).toContain('DATABASE_URL is not configured');
    }
  });
});
