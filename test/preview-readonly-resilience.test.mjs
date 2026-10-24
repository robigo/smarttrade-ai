import test from 'node:test';
import assert from 'node:assert/strict';

const base='https://smarttrade-ai-preview.goshen-r.workers.dev';
const paths=['/health','/api/market/status','/api/market/quote?symbol=AAPL'];
const durationMs=20000;

test('Preview endpoints remain responsive under small read-only burst',async()=>{
  const started=Date.now();
  const checks=Array.from({length:12},(_,i)=>paths[i%paths.length]);
  const results=await Promise.all(checks.map(async path=>{
    const start=Date.now();
    const response=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    const body=await response.json();
    return {path,status:response.status,body,ms:Date.now()-start};
  }));
  assert.ok(Date.now()-started<durationMs,'Read-only burst took too long');
  for(const item of results){
    if(item.path==='/health'){
      assert.equal(item.status,200);
      assert.equal(item.body?.status,'ok');
    }else{
      assert.equal(item.status,401,'Unauthenticated market data must remain blocked');
      assert.equal(item.body?.error,'unauthorized');
    }
  }
});
