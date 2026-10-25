import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/preview.js';

const encoder=new TextEncoder();
async function session(secret){
 const data=Buffer.from(JSON.stringify({sub:'authorized-test-user',email:'test@example.invalid',exp:Date.now()+60000})).toString('base64url');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,encoder.encode(data))).toString('base64url');
 return data+'.'+sig;
}
function environment(secret,quotaFetch){
 return {GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',GOOGLE_SESSION_SECRET:secret,
 GOOGLE_ALLOWED_EMAIL:'test@example.invalid',MARKET_DISPLAY_APPROVED:'true',
 MARKET_QUOTA_GUARD_READY:'true',TWELVE_DATA_API_KEY:'offline-placeholder',
 MARKET_QUOTA:{idFromName:()=> 'quota-id',get:()=>({fetch:quotaFetch})}};
}
test('quota 429 denies provider requests and does not cache a response',async()=>{
 const secret='s'.repeat(40),cookie='st_session='+await session(secret);
 const oldFetch=globalThis.fetch,oldCaches=globalThis.caches;
 let provider=0,writes=0;
 try{
  globalThis.caches={default:{match:async()=>null,put:async()=>{writes++}}};
  globalThis.fetch=async()=>{provider++;throw Error('provider must not be called')};
  const env=environment(secret,async()=>new Response('{}',{status:429}));
  const response=await worker.fetch(new Request('https://preview.invalid/api/market/quote?symbol=AAPL',{headers:{cookie}}),env);
  assert.equal(response.status,429);
  assert.equal((await response.json()).error,'provider_quota_exceeded');
  assert.equal(provider,0);assert.equal(writes,0);
 }finally{globalThis.fetch=oldFetch;if(oldCaches===undefined)delete globalThis.caches;else globalThis.caches=oldCaches}
});
test('quota service errors fail closed before contacting provider',async()=>{
 const secret='s'.repeat(40),cookie='st_session='+await session(secret);
 const oldFetch=globalThis.fetch,oldCaches=globalThis.caches;
 let provider=0;
 try{
  globalThis.caches={default:{match:async()=>null,put:async()=>{throw Error('must not write cache')}}};
  globalThis.fetch=async()=>{provider++;throw Error('must not call provider')};
  const env=environment(secret,async()=>new Response('{}',{status:503}));
  const response=await worker.fetch(new Request('https://preview.invalid/api/market/quote?symbol=MSFT',{headers:{cookie}}),env);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'quota_guard_unavailable');
  assert.equal(provider,0);
 }finally{globalThis.fetch=oldFetch;if(oldCaches===undefined)delete globalThis.caches;else globalThis.caches=oldCaches}
});
test('provider timeout returns sanitized error without caching',async()=>{
 const secret='s'.repeat(40),cookie='st_session='+await session(secret);
 const oldFetch=globalThis.fetch,oldCaches=globalThis.caches;
 let writes=0,quotaCalls=0;
 try{
  globalThis.caches={default:{match:async()=>null,put:async()=>{writes++}}};
  globalThis.fetch=async()=>{throw Error('secret provider detail')};
  const env=environment(secret,async()=>{quotaCalls++;return new Response('{}',{status:200})});
  const response=await worker.fetch(new Request('https://preview.invalid/api/market/quote?symbol=SPY',{headers:{cookie}}),env);
  assert.equal(response.status,502);
  assert.equal((await response.json()).error,'provider_unavailable');
  assert.equal(quotaCalls,1);assert.equal(writes,0);
 }finally{globalThis.fetch=oldFetch;if(oldCaches===undefined)delete globalThis.caches;else globalThis.caches=oldCaches}
});
