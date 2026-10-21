// Storage adapter for a future dedicated budget service. No API calls or billing.
// Caller MUST supply durable storage with a cross-process atomic transaction method.
// This module does not create or configure a backing database.
import {reserveEstimatedCost} from './codex-budget-policy.mjs';

export async function reserveDurably(storage, {month, requestId, estimateCents}) {
  if (!storage || typeof storage.transaction !== 'function')
    return {allowed:false,reason:'atomic_storage_unavailable'};
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(requestId))
    return {allowed:false,reason:'invalid_identity'};
  // A transaction MUST lock the month ledger and request ID across ALL runners.
  return storage.transaction(async tx => {
    const previous = await tx.get('request:'+month+':'+requestId);
    if (previous !== undefined) return {allowed:false,reason:'duplicate_request'};
    const key='budget:'+month;
    const ledger=await tx.get(key);
    // Never initialize a missing ledger to zero: require explicit reconciled opening balance.
    if (!ledger || ledger.reconciled !== true)
      return {allowed:false,reason:'unreconciled_ledger'};
    const reservation=reserveEstimatedCost(ledger,estimateCents);
    if (!reservation.allowed) return reservation;
    await tx.put(key,{...reservation.ledger,reconciled:true});
    await tx.put('request:'+month+':'+requestId,{estimateCents,status:'reserved'});
    return {allowed:true,reason:'reserved'};
  });
}
