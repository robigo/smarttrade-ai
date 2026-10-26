import test from 'node:test';
import assert from 'node:assert/strict';
import production from '../cloudflare/src/production.js';
import {handleAuth} from '../cloudflare/src/auth.js';

const origin='https://production.example.invalid';
const env={AUTH_PUBLIC_ORIGIN:origin,GOOGLE_CLIENT_ID:'offline-client',GOOGLE_CLIENT_SECRET:'offline-secret',GOOGLE_SESSION_SECRET:'s'.repeat(40),GOOGLE_ALLOWED_EMAIL:'owner@example.invalid'};
const request=(path,headers={})=>new Request(origin+path,{headers});
async function signedSession(){
 const data=Buffer.from(JSON.stringify({sub:'offline-owner',email:env.GOOGLE_ALLOWED_EMAIL,exp:Date.now()+60000})).toString('base64url');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.GOOGLE_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return 'st_session='+data+'.'+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data))).toString('base64url');
}
test('Production blocks missing, invalid, mismatched and Preview origins',async()=>{
 for(const value of [undefined,'http://production.example.invalid',origin+'/path',origin+'?x=1',origin+'#x',origin+'/', 'https://user:pass@production.example.invalid','https://other.example.invalid','https://smarttrade-ai-preview.goshen-r.workers.dev']){
  const response=await production.fetch(request('/auth/google/start'),{...env,AUTH_PUBLIC_ORIGIN:value});
  assert.equal(response.status,503,String(value));
  assert.equal(response.headers.get('location'),null);
 }
 const missing=await handleAuth(request('/auth/google/start'),{...env,AUTH_PUBLIC_ORIGIN:undefined},new URL(origin+'/auth/google/start'));
 assert.equal(missing.status,503);
});
test('legacy bearer endpoint and real trading endpoints cannot reach a provider',async()=>{
 const saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;throw Error('network forbidden')};
  for(const path of ['/api/quote?symbol=AAPL','/api/trade','/api/orders','/api/broker/order']){
   const r=await production.fetch(request(path,{authorization:'Bearer '+'x'.repeat(40)}),{...env,SMARTTRADE_ACCESS_TOKEN:'x'.repeat(40),TWELVE_DATA_API_KEY:'offline-placeholder'});
   assert.equal(r.status,404,path);
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=saved}
});
test('Production market gates reject before provider calls, including quota denial',async()=>{
 const saved=globalThis.fetch;let calls=0,quotaCalls=0;
 const cookie=await signedSession();
 try{
  globalThis.fetch=async()=>{calls++;throw Error('network forbidden')};
  const quote=request('/api/market/quote?symbol=AAPL',{cookie});
  for(const [extra,status,error] of [
   [{},403,'market_display_disabled'],
   [{MARKET_DISPLAY_APPROVED:'true'},503,'quota_guard_not_ready'],
   [{MARKET_DISPLAY_APPROVED:'true',MARKET_QUOTA_GUARD_READY:'true'},503,'provider_not_configured'],
   [{MARKET_DISPLAY_APPROVED:'true',MARKET_QUOTA_GUARD_READY:'true',TWELVE_DATA_API_KEY:'offline-placeholder'},503,'quota_guard_unavailable']
  ]){
   const response=await production.fetch(quote,{...env,...extra});
   assert.equal(response.status,status);assert.equal((await response.json()).error,error);
  }
  const oldCaches=globalThis.caches;
  try{
   globalThis.caches={default:{match:async()=>null,put:async()=>{throw Error('must not cache')}}};
   const e={...env,MARKET_DISPLAY_APPROVED:'true',MARKET_QUOTA_GUARD_READY:'true',TWELVE_DATA_API_KEY:'offline-placeholder',MARKET_QUOTA:{idFromName:()=> 'offline',get:()=>({fetch:async()=>{quotaCalls++;return new Response('{}',{status:429})}})}};
   const r=await production.fetch(quote,e);
   assert.equal(r.status,429);assert.equal(quotaCalls,1);
  }finally{if(oldCaches===undefined)delete globalThis.caches;else globalThis.caches=oldCaches}
  assert.equal(calls,0);
  const anonymous=await production.fetch(request('/api/market/quote?symbol=AAPL'),env);
  assert.equal(anonymous.status,401);
 }finally{globalThis.fetch=saved}
});
test('Production serves the shared UI assets and identifies its own health',async()=>{
 const response=await production.fetch(request('/'),{...env,ASSETS:{fetch:async()=>new Response('<title>SmartTrade AI</title>',{headers:{'content-type':'text/html'}})}});
 assert.match(await response.text(),/SmartTrade AI/);
 const health=await production.fetch(request('/health'),{RELEASE_SHA:'a'.repeat(40)});
 const data=await health.json();assert.equal(data.service,'smarttrade-ai');assert.equal(data.revision,'a'.repeat(40));
});
test('OAuth start, token exchange and logout stay on configured origin (all Google calls mocked)',async()=>{
 const path='/auth/google/start';
 const start=await production.fetch(request(path),env);
 assert.equal(start.status,302);
 const google=new URL(start.headers.get('location'));
 assert.equal(google.searchParams.get('redirect_uri'),origin+'/auth/google/callback');
 const transaction=start.headers.get('set-cookie').split(';')[0];
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);Object.assign(jwk,{kid:'offline',use:'sig'});
 const now=Math.floor(Date.now()/1000);
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const input=encode({alg:'RS256',kid:'offline'})+'.'+encode({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,nonce:google.searchParams.get('nonce'),exp:now+60,iat:now,sub:'offline-owner',email:env.GOOGLE_ALLOWED_EMAIL,email_verified:true});
 const token=input+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url');
 const saved=globalThis.fetch;let exchanges=0;
 try{
  globalThis.fetch=async(url,options)=>{
   if(url==='https://oauth2.googleapis.com/token'){
    exchanges++;assert.equal(options.body.get('redirect_uri'),origin+'/auth/google/callback');
    assert.ok(options.body.get('code_verifier'));return Response.json({id_token:token});
   }
   assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[jwk]});
  };
  const callback='/auth/google/callback?code=offline&state='+encodeURIComponent(google.searchParams.get('state'));
  const response=await production.fetch(request(callback,{cookie:transaction}),env);
  assert.equal(response.status,302);assert.equal(response.headers.get('location'),origin+'/');assert.equal(exchanges,1);
  const session=response.headers.getSetCookie().find(c=>c.startsWith('st_session='));assert.ok(session);
  assert.match(session,/Secure; HttpOnly; SameSite=Lax/);
  const me=await production.fetch(request('/auth/me',{cookie:session.split(';')[0]}),env);
  assert.equal((await me.json()).authenticated,true);
  const logout=await production.fetch(request('/auth/logout'),env);
  assert.equal(logout.headers.get('location'),origin+'/');assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 }finally{globalThis.fetch=saved}
});
