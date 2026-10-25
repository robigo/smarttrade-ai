import test from 'node:test';
import assert from 'node:assert/strict';
const base='https://smarttrade-ai-preview.goshen-r.workers.dev';
async function get(path){
  const res=await fetch(base+path,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(10000)});
  const body=await res.json().catch(()=>null);
  return {res,body};
}
test('public preview health identifies isolated service',async()=>{
  const {res,body}=await get('/health');
  assert.equal(res.status,200);
  assert.equal(body?.status,'ok');
  assert.equal(body?.service,'smarttrade-ai-preview');
  assert.equal(body?.mode,'auth-preview');
});
test('market status rejects unauthenticated users',async()=>{
  const {res,body}=await get('/api/market/status');
  assert.equal(res.status,401);
  assert.equal(body?.error,'unauthorized');
});
test('live quote rejects unauthenticated users',async()=>{
  const {res,body}=await get('/api/market/quote?symbol=AAPL');
  assert.equal(res.status,401);
  assert.equal(body?.error,'unauthorized');
});
test('unknown API endpoints remain disabled',async()=>{
  const {res,body}=await get('/api/not-enabled');
  assert.equal(res.status,404);
  assert.equal(body?.error,'preview_endpoint_disabled');
});
