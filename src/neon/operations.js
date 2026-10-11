// All asynchronous Neon operations are bounded by the caller's remaining execution budget.
import { call } from './client.js';

export async function waitForOperations(client, projectId, operations, {
  budgetMs = 20000, pollIntervalMs = 1000, now = Date.now, sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  if (!projectId || !Array.isArray(operations)) throw new TypeError('projectId and operations are required');
  const budget = Math.max(0, Math.min(45000, Number(budgetMs) || 0));
  const deadline = now() + budget;
  const remaining = new Map(operations.map(op => [op.id, { ...op }]));
  if (remaining.size !== operations.length || [...remaining.keys()].some(id => !id))
    throw new TypeError('Operations must have distinct IDs');
  const completed = [];
  while (remaining.size > 0 && now() < deadline) {
    for (const [id] of [...remaining]) {
      if (now() >= deadline) break;
      const result = await call(client, 'getProjectOperation',
        { path: { project_id: projectId, operation_id: id } },
        { write: false, budgetMs: Math.max(0, deadline - now()) });
      if (result.error) {
        return { done: 'pending', confirmed: null, operations: [...completed, ...remaining.values()],
          next: 'neon_operation_get with waitSeconds', error: result.error };
      }
      const operation = result.data?.operation;
      if (!operation) return { done: 'pending', confirmed: null,
        operations: [...completed, ...remaining.values()], next: 'neon_operation_get with waitSeconds' };
      if (['failed', 'error', 'cancelled'].includes(operation.status)) {
        return { done: false, confirmed: false, code: 'operation_failed',
          message: `Neon operation ${operation.action || 'change'} failed. Check its details in Neon.`,
          operations: [...completed, operation, ...[...remaining.values()].filter(v => v.id !== id)] };
      }
      if (['finished', 'skipped'].includes(operation.status)) {
        remaining.delete(id);
        completed.push(operation);
      } else {
        remaining.set(id, operation);
      }
    }
    if (remaining.size && now() + pollIntervalMs < deadline) await sleep(pollIntervalMs);
    else break;
  }
  return remaining.size === 0
    ? { done: true, confirmed: true, operations: completed }
    : { done: 'pending', confirmed: null, operations: [...completed, ...remaining.values()],
      next: 'neon_operation_get with waitSeconds' };
}
