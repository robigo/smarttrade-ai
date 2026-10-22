// Offline-only reconciliation policy. No provider calls, secrets or ledger writes.
// A reservation can be released only after independently verified provider usage.
// The caller must persist the returned ledger and request status atomically.
import {LIMIT_CENTS} from './codex-budget-policy.mjs';

export function reconcileVerifiedUsage(ledger, reservation, actualCents, evidence={}) {
  const deny=reason=>({ok:false,reason});
  if(!ledger || !Number.isSafeInteger(ledger.spentCents) ||
     !Number.isSafeInteger(ledger.reservedCents) ||
     ledger.spentCents<0 || ledger.reservedCents<0 || ledger.reconciled!==true)
    return deny('invalid_ledger');
  if(!reservation || reservation.status!=='reserved' ||
     !Number.isSafeInteger(reservation.estimateCents) || reservation.estimateCents<1 ||
     ledger.reservedCents<reservation.estimateCents)
    return deny('invalid_reservation');
  if(evidence.verified!==true || typeof evidence.providerRequestId!=='string' ||
     evidence.providerRequestId.length<8 || evidence.monthMatched!==true)
    return deny('provider_usage_unverified');
  if(!Number.isSafeInteger(actualCents)||actualCents<0)
    return deny('actual_cost_unknown');
  const spent=ledger.spentCents+actualCents;
  const reserved=ledger.reservedCents-reservation.estimateCents;
  if(!Number.isSafeInteger(spent)||!Number.isSafeInteger(reserved))
    return deny('cost_overflow');
  // Never claim that an already incurred overage was prevented.
  // Freeze further activity until explicit reconciliation/review.
  const overLimit=spent+reserved>LIMIT_CENTS;
  return {ok:true,overLimit,ledger:{...ledger,spentCents:spent,reservedCents:reserved,
    reconciled:!overLimit},reservation:{...reservation,status:'reconciled',
    actualCents,providerRequestId:evidence.providerRequestId}};
}
