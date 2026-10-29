import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import gateway from '../cloudflare/src/index.js';
const origin='https://smarttrade-ai.goshen-r.workers.dev';
const request=(path,options)=>new Request(origin+path,options);
const auth=()=>({GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_SESSION_SECRET:'s'.repeat(48),GOOGLE_ALLOWED_EMAIL:'owner@example.invalid'});
const app=()=>({...auth(),ACCOUNT_APP_ENABLED:'true',GOOGLE_APP_ORIGIN:origin,PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:{prepare(){return {bind(){return this;},async first(){return null;}};}},ASSETS:{fetch:async()=>new Response('<title>SmartTrade AI</title>')}});
function cookie(env){const data=Buffer.from(JSON.stringify({sub:'synthetic-owner',email:env.GOOGLE_ALLOWED_EMAIL,exp:Date.now()+3600000})).toString('base64url');return 'st_session='+data+'.'+createHmac('sha256',env.GOOGLE_SESSION_SECRET).update(data).digest('base64url');}

test('existing health and unknown routes retain their contract when the app is disabled',async()=>{
 const health=await gateway.fetch(request('/health'),{});
 assert.deepEqual(await health.json(),{status:'ok',service:'smarttrade-private-gateway',quotes:'restricted'});
 for(const path of ['/','/index.html','/account-client.js','/api/private/portfolio','/api/market/status'])assert.equal((await gateway.fetch(request(path),{})).status,404);
});
test('legacy quote endpoint retains methods, authorization and configuration errors',async()=>{
 assert.equal((await gateway.fetch(request('/api/quote',{method:'POST'}),{})).status,405);
 assert.equal((await gateway.fetch(request('/api/quote?symbol=AAPL'),{})).status,401);
 const env={SMARTTRADE_ACCESS_TOKEN:'x'.repeat(40)};
 const req=path=>request(path,{headers:{authorization:'Bearer '+env.SMARTTRADE_ACCESS_TOKEN}});
 assert.equal((await gateway.fetch(req('/api/quote?symbol=AAPL'),env)).status,503);
 assert.equal((await gateway.fetch(req('/api/quote?symbol=INVALID'),{...env,TWELVE_DATA_API_KEY:'synthetic-key'})).status,400);
});
test('legacy authorized quote response is preserved using a mocked upstream only',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async url=>{calls++;assert.equal(new URL(url).hostname,'api.twelvedata.com');return new Response(JSON.stringify({close:'123.45',datetime:'fixture-time'}));});
 const env={SMARTTRADE_ACCESS_TOKEN:'x'.repeat(40),TWELVE_DATA_API_KEY:'synthetic-key',...app()};
 const response=await gateway.fetch(request('/api/quote?symbol=AAPL',{headers:{authorization:'Bearer '+env.SMARTTRADE_ACCESS_TOKEN}}),env);
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.price,123.45);assert.equal(data.source,'Twelve Data');assert.equal(calls,1);
});
test('legacy auth redirect and CORS remain unchanged before optional app activation',async()=>{
 const response=await gateway.fetch(request('/auth/google/start'),auth());
 assert.equal(new URL(response.headers.get('location')).searchParams.get('redirect_uri'),'https://smarttrade-ai-preview.goshen-r.workers.dev/auth/google/callback');
 const cors=await gateway.fetch(request('/auth/me',{method:'OPTIONS',headers:{Origin:'https://robigo.github.io'}}),auth());
 assert.equal(cors.status,204);assert.equal(cors.headers.get('Access-Control-Allow-Origin'),'https://robigo.github.io');
});
test('optional website requires a matching origin and storage instead of falling back to Preview',async()=>{
 for(const env of [{...app(),GOOGLE_APP_ORIGIN:'https://smarttrade-ai-preview.goshen-r.workers.dev'},{...app(),PORTFOLIO_DB:undefined},{...app(),PORTFOLIO_SYNC_ENABLED:'false'},{...app(),GOOGLE_CLIENT_SECRET:undefined}])assert.equal((await gateway.fetch(request('/'),env)).status,503);
 const response=await gateway.fetch(request('/'),app());assert.equal(response.status,200);assert.match(await response.text(),/SmartTrade AI/);
});
test('account route rejects anonymous access and delegates authorized sessions to the existing ledger handler',async()=>{
 const env=app();assert.equal((await gateway.fetch(request('/api/private/portfolio'),env)).status,401);
 const response=await gateway.fetch(request('/api/private/portfolio',{headers:{cookie:cookie(env)}}),env);
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.accountId,'synthetic-owner');assert.equal(data.version,0);assert.equal(data.snapshot.cashCents,1500000);
});
test('new UI market routes cannot call the paid provider even while the old gateway remains available',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('New UI must never call a provider');});
 const env={...app(),MARKET_DISPLAY_APPROVED:'true',MARKET_QUOTA_GUARD_READY:'true',TWELVE_DATA_API_KEY:'synthetic-key'};
 const headers={cookie:cookie(env)};
 const status=await gateway.fetch(request('/api/market/status',{headers}),env);assert.equal((await status.json()).quotesEnabled,false);
 const quote=await gateway.fetch(request('/api/market/quote?symbol=AAPL',{headers}),env);assert.equal(quote.status,403);assert.equal((await quote.json()).error,'market_display_disabled');
});
test('existing target overlay neither creates a new Worker nor enables account storage by default',()=>{
 const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.existing-production.json',import.meta.url),'utf8'));
 assert.equal(cfg.name,'smarttrade-ai');assert.equal(cfg.main,'cloudflare/src/index.js');assert.equal(cfg.vars.ACCOUNT_APP_ENABLED,'false');assert.equal(cfg.vars.PORTFOLIO_SYNC_ENABLED,'false');assert.equal(cfg.d1_databases,undefined);
});
