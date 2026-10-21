// Dedicated diagnostic namespace, separate from all budget ledger keys.
// This never grants spending permission and must only be called after gateway auth.
export async function checkStoragePersistence(storage) {
  if (!storage || typeof storage.transaction !== 'function')
    return {ok:false,reason:'storage_unavailable'};
  try {
    const sequence=await storage.transaction(async tx=>{
      const key='diagnostic:persistence:v1';
      const previous=await tx.get(key);
      if (previous!==undefined && (!Number.isSafeInteger(previous)||previous<0))
        throw Error('invalid_diagnostic_state');
      const next=(previous??0)+1;
      if (!Number.isSafeInteger(next)) throw Error('diagnostic_overflow');
      await tx.put(key,next);
      return next;
    });
    return {ok:true,sequence};
  } catch {
    return {ok:false,reason:'storage_unavailable'};
  }
}
