import test from 'node:test';
import assert from 'node:assert/strict';
import preview from '../cloudflare/src/preview.js';

// Offline checks: no credentials, provider fetches, or paid API calls.
const origin='https://smarttrade-ai-preview.goshen-r.workers.dev';
const env={
  MARKET_DISPLAY_APPROVED:'false',
  ASSETS:{fetch(){throw Error('unexpected asset request')}}
};
test('anonymous requests cannot read market status or quote',async()=>{
  for(const path of ['/api/market/status','/api/market/quote?symbol=AAPL']){
    const response=await preview.fetch(new Request(origin+path),env);
    assert.equal(response.status,401,path);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{error:'unauthorized'});
  }
});
test('market endpoints reject non-GET before authorization or provider access',async()=>{
  for(const path of ['/api/market/status','/api/market/quote?symbol=AAPL']){
    const response=await preview.fetch(new Request(origin+path,{method:'POST'}),env);
    assert.equal(response.status,405,path);
    assert.equal((await response.json()).error,'method_not_allowed');
  }
});
test('unknown API paths remain disabled',async()=>{
  const response=await preview.fetch(new Request(origin+'/api/unknown'),env);
  assert.equal(response.status,404);
  assert.equal((await response.json()).error,'preview_endpoint_disabled');
});
test('health endpoint does not require authentication or access market provider',async()=>{
  const response=await preview.fetch(new Request(origin+'/health'),env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.status,'ok');
  assert.equal(data.service,'smarttrade-ai-preview');
});

test('forged session cookie cannot authorize market access',async()=>{
  const headers={cookie:'st_session=forged.payload'};
  for(const path of ['/api/market/status','/api/market/quote?symbol=MSFT']){
    const response=await preview.fetch(new Request(origin+path,{headers}),{
      ...env,GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',
      GOOGLE_SESSION_SECRET:'s'.repeat(40),GOOGLE_ALLOWED_EMAIL:'tester@example.invalid'
    });
    assert.equal(response.status,401,path);
    assert.equal((await response.json()).error,'unauthorized');
  }
});
test('unsupported methods never reach asset or market provider',async()=>{
  for(const method of ['PUT','DELETE']){
    const response=await preview.fetch(new Request(origin+'/api/market/quote?symbol=SPY',{method}),env);
    assert.equal(response.status,405);
    assert.equal((await response.json()).error,'method_not_allowed');
  }
});
