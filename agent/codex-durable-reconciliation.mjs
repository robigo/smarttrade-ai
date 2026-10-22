// Offline-only atomic reconciliation adapter for a future Durable Object storage binding.
// No network, provider calls, secrets, workflow triggers, or live budget writes.
import {reconcileVerifiedUsage} from './codex-usage-reconciliation.mjs';

export async function reconcileDurably(storage,{month,requestId,actualCents,evidence}={}) {
  const deny=reason=>({ok:false,reason});
  if(!storage||typeof storage.transaction!=='function')return deny('atomic_storage_unavailable');
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||
     typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(requestId))
    return deny('invalid_identity');
  if(evidence?.verified!==true||typeof evidence.providerRequestId!=='string'||
     evidence.providerRequestId.length<8||evidence.monthMatched!==true)
    return deny('provider_usage_unverified');
  try {
    return await storage.transaction(async tx=>{
      const ledgerKey='budget:'+month;
      const requestKey='request:'+month+':'+requestId;
      const providerKey='provider-usage:'+month+':'+evidence.providerRequestId;
      const prior=await tx.get(providerKey);
      if(prior!==undefined)return deny('duplicate_provider_usage');
      const reservation=await tx.get(requestKey);
      const ledger=await tx.get(ledgerKey);
      const result=reconcileVerifiedUsage(ledger,reservation,actualCents,evidence);
      if(!result.ok)return result;
      await tx.put(ledgerKey,result.ledger);
      await tx.put(requestKey,result.reservation);
      await tx.put(providerKey,{requestId,status:'reconciled'});
      return {ok:true,overLimit:result.overLimit};
    });
  } catch {return deny('storage_unavailable');}
}
