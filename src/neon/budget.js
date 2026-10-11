// Every serverless instance shares one atomic rate-limit row per minute and API key.
import { createHash } from 'node:crypto';

export const DEFAULT_NEON_API_BUDGET_PER_MINUTE = 500;
export function makeNeonBudget({ db, apiKey, limitPerMinute = DEFAULT_NEON_API_BUDGET_PER_MINUTE,
  now = () => Date.now() } = {}) {
  if (typeof db?.consumeApiBudget !== 'function') throw new TypeError('A database-backed budget is required');
  if (typeof apiKey !== 'string' || !apiKey) throw new TypeError('A Neon API key is required');
  if (!Number.isInteger(limitPerMinute) || limitPerMinute < 1 || limitPerMinute > 699)
    throw new RangeError('Budget must be an integer from 1 to 699 requests per minute');
  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  return Object.freeze({
    async consume({ calls = 1 } = {}) {
      if (calls !== 1) throw new TypeError('Each Neon API attempt consumes one budget slot');
      const time = now();
      if (!Number.isFinite(time) || time < 0) throw new TypeError('Invalid clock');
      const start = Math.floor(time / 60000) * 60000;
      // A database outage must refuse an API call, not bypass the limit.
      const result = await db.consumeApiBudget({
        keyHash, windowStart: new Date(start), limit: limitPerMinute
      });
      return result.allowed
        ? { allowed: true, count: result.count }
        : { allowed: false, count: result.count,
          retryAfterSeconds: Math.max(1, Math.ceil((start + 60000 - time) / 1000)) };
    }
  });
}
