import { test, expect } from 'vitest';
// TEMPORARY: proves CI turns red on a failing test. Removed in the next push.
test('deliberately failing (CI red proof)', () => { expect(1).toBe(2); });
