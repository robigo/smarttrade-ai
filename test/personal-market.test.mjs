import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import gateway from '../cloudflare/src/index.js';
const origin='https://smarttrade-ai.goshen-r.workers.dev';
function environment(reserve=async()=>Response.json({allowed:true})){
 return {ACCOUNT_APP_ENABLED:'true',GOOGLE_APP_ORIGIN:origin,GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_SESSION_SECRET:'s'.repeat(48),GOOGLE_ALLOWED_EMAIL:'owner@example.invalid',PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:{},ASSETS:{fetch:async()=>new Response('asset')},TWELVE_DATA_API_KEY:'synthetic-private-key',SMARTTRADE_ACCESS_TOKEN:'b'.repeat(48),MARKET_LEARNING_ENABLED:'true',MARKET_QUOTA_GUARD_READY:'true',MARKET_QUOTA:{idFromName:name=>name,get:id=>({fetch:async(...args)=>reserve(...args,id)})}};
}
function request(env,route,{anonymous=false,method='GET'}={}){
 const data=Buffer.from(JSON.stringify({sub:'test-owner',email:env.GOOGLE_ALLOWED_EMAIL,exp:Date.now()+60000})).toString('base64url');
 const headers=anonymous?{}:{cookie:'st_session='+data+'.'+createHmac('sha256',env.GOOGLE_SESSION_SECRET).update(data).digest('base64url')};
 return new Request(origin+route,{method,headers});
}
const quote={price:'123.45'};
test('only explicit personal mode enables quotes; public display flag does not enable it',async()=>{
 const env=environment();const status=await gateway.fetch(request(env,'/api/market/status'),env);const data=await status.json();assert.equal(data.quotesEnabled,true);assert.equal(data.automaticPolling,false);
 delete env.MARKET_LEARNING_ENABLED;env.MARKET_DISPLAY_APPROVED='true';assert.equal((await (await gateway.fetch(request(env,'/api/market/status'),env)).json()).quotesEnabled,false);
});
test('anonymous, wrong methods, unsupported symbols and missing guards make no provider request',async t=>{
 let reserves=0;const env=environment(async()=>{reserves++;throw Error('unexpected reservation')});t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected provider call')});
 assert.equal((await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL',{anonymous:true}),env)).status,401);
 assert.equal((await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL',{method:'POST'}),env)).status,405);
 assert.equal((await gateway.fetch(request(env,'/api/market/quote?symbol=INVALID'),env)).status,400);
 assert.equal((await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL'),{...env,MARKET_QUOTA:undefined})).status,503);
 assert.equal((await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL'),{...env,TWELVE_DATA_API_KEY:undefined})).status,503);
 assert.equal(reserves,0);
});
test('both private endpoints reserve the same persistent counter before upstream access',async t=>{
 const names=[];let reservations=0,calls=0;
 const env=environment(async(_url,options,id)=>{assert.equal(options.method,'POST');names.push(id);reservations++;return Response.json({allowed:true})});
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;assert.equal(reservations,calls);assert.equal(new URL(url).pathname,'/price');assert.equal(new URL(url).searchParams.get('apikey'),env.TWELVE_DATA_API_KEY);assert.equal(options.redirect,'manual');return Response.json(quote)});
 const a=await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL'),env);const body=await a.text();assert.equal(a.status,200);assert.ok(!body.includes(env.TWELVE_DATA_API_KEY));assert.equal(JSON.parse(body).price,123.45);assert.equal(a.headers.get('cache-control'),'no-store');
 const b=await gateway.fetch(new Request(origin+'/api/quote?symbol=AAPL',{headers:{authorization:'Bearer '+env.SMARTTRADE_ACCESS_TOKEN}}),env);assert.equal(b.status,200);assert.deepEqual(names,['twelvedata-basic8-personal','twelvedata-basic8-personal']);assert.equal(calls,2);
});
test('quota denials and storage failures stop before upstream requests',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('must not contact provider')});
 for(const reserve of [async()=>Response.json({retryAfterSeconds:3600},{status:429}),async()=>new Response('',{status:503}),async()=>{throw Error('private storage error')}]){
  const env=environment(reserve);const response=await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL'),env);assert.ok([429,503,502].includes(response.status));const text=await response.text();assert.ok(!text.includes('private storage error'));if(response.status===429)assert.equal(response.headers.get('retry-after'),'3600');
 }
});
test('provider access, quota, malformed data and transport errors are sanitized',async t=>{
 const env=environment();
 const cases=[{body:{code:401,message:env.TWELVE_DATA_API_KEY},status:200,want:403},{body:{code:429},status:429,want:429},{body:{...quote,currency:'EUR'},status:200,want:502},{body:{...quote,price:'NaN'},status:200,want:502},{body:{...quote,symbol:'MSFT'},status:200,want:502}];
 for(const fixture of cases){const mock=t.mock.method(globalThis,'fetch',async()=>Response.json(fixture.body,{status:fixture.status}));const r=await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL'),env);assert.equal(r.status,fixture.want);assert.ok(!(await r.text()).includes(env.TWELVE_DATA_API_KEY));mock.mock.restore();}
 t.mock.method(globalThis,'fetch',async()=>{throw Error('url contains '+env.TWELVE_DATA_API_KEY)});const r=await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL'),env);assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'provider_connection_failed'});
});

test('copied whitespace is trimmed and provider credential failures differ from plan restrictions',async t=>{
 const env=environment();env.TWELVE_DATA_API_KEY='  synthetic-private-key\n';
 for(const code of [401,403]){
  const mock=t.mock.method(globalThis,'fetch',async url=>{assert.equal(new URL(url).searchParams.get('apikey'),'synthetic-private-key');return Response.json({code,message:'Never output '+env.TWELVE_DATA_API_KEY},{status:code})});
  const r=await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL'),env);const data=await r.json();assert.equal(r.status,403);assert.equal(data.error,code===401?'provider_key_invalid':'provider_plan_restricted');assert.equal(data.providerCode,code);assert.ok(!JSON.stringify(data).includes('synthetic-private-key'));mock.mock.restore();
 }
});

test('provider redirects are rejected without following or exposing the API key',async t=>{
 let calls=0;const env=environment();t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://other.invalid/private'}})});
 const r=await gateway.fetch(request(env,'/api/market/quote?symbol=AAPL'),env);assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'provider_redirect_rejected'});assert.equal(calls,1);assert.equal(r.headers.get('location'),null);
});
