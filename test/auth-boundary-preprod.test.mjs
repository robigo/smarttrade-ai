import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleAuth,getAuthorizedSession} from '../cloudflare/src/auth.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base='https://smarttrade-ai-preview.goshen-r.workers.dev';
const env={GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_SESSION_SECRET:'x'.repeat(48),GOOGLE_ALLOWED_EMAIL:'owner@example.test'};
const req=(path,options={})=>new Request(base+path,options);
test('auth is fail-closed without secrets',async()=>{
 const response=await handleAuth(req('/auth/me'),{},new URL(base+'/auth/me'));
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'auth_not_configured'});
});
test('OAuth start sets secure short-lived transaction and PKCE challenge',async()=>{
 const url=new URL(base+'/auth/google/start');
 const response=await handleAuth(req(url.pathname),env,url);
 assert.equal(response.status,302);
 const cookie=response.headers.get('set-cookie');
 assert.match(cookie,/st_oauth=/);
 assert.match(cookie,/Secure; HttpOnly; SameSite=Lax; Max-Age=300/);
 const google=new URL(response.headers.get('location'));
 assert.equal(google.origin,'https://accounts.google.com');
 assert.equal(google.searchParams.get('code_challenge_method'),'S256');
 assert.ok(google.searchParams.get('state'));
 assert.ok(google.searchParams.get('nonce'));
});
test('OAuth callback refuses missing and incorrect state without external token call',async()=>{
 for(const path of ['/auth/google/callback?code=abc&state=bad','/auth/google/callback']){
   const url=new URL(base+path);
   const response=await handleAuth(req(path),env,url);
   assert.equal(response.status,401);
   assert.equal((await response.json()).error,'invalid_oauth_state');
 }
});
test('unauthenticated sessions rejected',async()=>{
 assert.equal(await getAuthorizedSession(req('/api/market/status'),env),null);
 const url=new URL(base+'/auth/me');
 const response=await handleAuth(req('/auth/me'),env,url);
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{authenticated:false});
});
test('logout clears session cookie',async()=>{
 const url=new URL(base+'/auth/logout');
 const response=await handleAuth(req('/auth/logout'),env,url);
 assert.equal(response.status,302);
 assert.match(response.headers.get('set-cookie'),/st_session=;.*Max-Age=0/);
});
test('non-GET authentication endpoints are rejected',async()=>{
 const url=new URL(base+'/auth/google/start');
 const response=await handleAuth(req('/auth/google/start',{method:'POST'}),env,url);
 assert.equal(response.status,405);
});
