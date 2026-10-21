// Offline reservation arithmetic only. Not a durable or cross-run spending limiter.
// Production use requires atomic persistence, verified provider usage and fail-closed reconciliation.
export const LIMIT_CENTS=500;
export function reserveEstimatedCost(ledger, estimateCents) {
  if (!ledger || !Number.isSafeInteger(ledger.spentCents) ||
      !Number.isSafeInteger(ledger.reservedCents) ||
      ledger.spentCents<0 || ledger.reservedCents<0 ||
      !Number.isSafeInteger(estimateCents) || estimateCents<=0)
    return {allowed:false,reason:'invalid_or_unknown_cost'};
  const total=ledger.spentCents+ledger.reservedCents+estimateCents;
  if (!Number.isSafeInteger(total) || total>LIMIT_CENTS)
    return {allowed:false,reason:'budget_exceeded'};
  return {allowed:true,ledger:{...ledger,reservedCents:ledger.reservedCents+estimateCents}};
}
