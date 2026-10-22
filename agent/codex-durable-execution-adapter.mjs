// Preview-only adapter: connect the execution gate to the existing atomic budget ledger.
// Not connected to any public endpoint, scheduled workflow, or paid API transport.
import {executeBudgetedCodex} from './codex-budgeted-execution.mjs';
import {reserveDurably} from './codex-durable-budget.mjs';

export async function executeWithDurableBudget({storage, invoke, ...config}={}) {
  // Never treat a missing/non-atomic storage backend as an in-memory fallback.
  if (!storage || typeof storage.transaction !== 'function')
    return {executed:false,reason:'atomic_storage_unavailable'};
  return executeBudgetedCodex({
    ...config,
    reserve: request=>reserveDurably(storage,request),
    invoke
  });
}
