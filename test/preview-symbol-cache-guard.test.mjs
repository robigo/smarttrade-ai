import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/preview.js';

test('unsupported symbols fail before cache or provider access',async()=>{
 let provider=0, cacheReads=0;
 const originalCaches=globalThis.caches;
 const originalFetch=globalThis.fetch;
 try{
  globalThis.caches={default:{match:async()=>{cacheReads++;throw Error('unexpected cache read');}}};
  globalThis.fetch=async()=>{provider++;throw Error('unexpected provider call');};
  const env={MARKET_DISPLAY_APPROVED:'true',MARKET_QUOTA_GUARD_READY:'true',TWELVE_DATA_API_KEY:'dummy',MARKET_QUOTA:{},GOOGLE_CLIENT_ID:'dummy',GOOGLE_CLIENT_SECRET:'dummy',GOOGLE_SESSION_SECRET:'x'.repeat(40),GOOGLE_ALLOWED_EMAIL:'test@example.com'};
  // Anonymous requests must fail before cache and provider access.
  const response=await worker.fetch(new Request('https://preview.invalid/api/market/quote?symbol=INVALID'),env);
  assert.equal(response.status,401);
  assert.equal(cacheReads,0);
  assert.equal(provider,0);
 }finally{
  if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;
  globalThis.fetch=originalFetch;
 }
});
