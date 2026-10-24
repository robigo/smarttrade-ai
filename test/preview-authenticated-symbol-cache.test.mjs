import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/preview.js';

const encoder = new TextEncoder();
function b64u(bytes) {
 return Buffer.from(bytes).toString('base64url');
}
async function signedSession(secret) {
 const payload=b64u(encoder.encode(JSON.stringify({sub:'test-user',email:'test@example.invalid',exp:Date.now()+60000})));
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=b64u(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))));
 return payload+'.'+sig;
}
test('authenticated unsupported symbol is rejected before cache, quota or provider calls',async()=>{
 const secret='s'.repeat(40);
 const session=await signedSession(secret);
 let cacheReads=0,quotaCalls=0,providerCalls=0;
 const oldCaches=globalThis.caches,oldFetch=globalThis.fetch;
 try{
  globalThis.caches={default:{match:async()=>{cacheReads++;return null;}}};
  globalThis.fetch=async()=>{providerCalls++;throw Error('unexpected provider call');};
  const env={
   GOOGLE_CLIENT_ID:'dummy',GOOGLE_CLIENT_SECRET:'dummy',GOOGLE_SESSION_SECRET:secret,
   GOOGLE_ALLOWED_EMAIL:'test@example.invalid',MARKET_DISPLAY_APPROVED:'true',
   MARKET_QUOTA_GUARD_READY:'true',TWELVE_DATA_API_KEY:'dummy',
   MARKET_QUOTA:{idFromName:()=>{quotaCalls++;return 'id';},get:()=>{quotaCalls++;throw Error('unexpected quota');}}
  };
  const response=await worker.fetch(new Request('https://preview.invalid/api/market/quote?symbol=INVALID',{headers:{cookie:'st_session='+session}}),env);
  assert.equal(response.status,400);
  assert.equal((await response.json()).error,'unsupported_symbol');
  assert.equal(cacheReads,0);
  assert.equal(quotaCalls,0);
  assert.equal(providerCalls,0);
 }finally{
  if(oldCaches===undefined)delete globalThis.caches;else globalThis.caches=oldCaches;
  globalThis.fetch=oldFetch;
 }
});
