import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuth} from '../cloudflare/src/auth.js';
const env={GOOGLE_CLIENT_ID:'offline-client',GOOGLE_CLIENT_SECRET:'offline-secret',GOOGLE_SESSION_SECRET:'x'.repeat(48),GOOGLE_ALLOWED_EMAIL:'owner@example.invalid'};
test('configured HTTPS origin controls Google callback and logout destination',async()=>{
 const settings={...env,GOOGLE_APP_ORIGIN:'https://account.example.invalid'};
 const url=new URL(settings.GOOGLE_APP_ORIGIN+'/auth/google/start');
 const response=await handleAuth(new Request(url),settings,url);
 assert.equal(new URL(response.headers.get('location')).searchParams.get('redirect_uri'),settings.GOOGLE_APP_ORIGIN+'/auth/google/callback');
 const logout=new URL(settings.GOOGLE_APP_ORIGIN+'/auth/logout');
 assert.equal((await handleAuth(new Request(logout),settings,logout)).headers.get('location'),settings.GOOGLE_APP_ORIGIN+'/');
});
test('invalid configured origins fail closed',async()=>{
 for(const origin of ['http://account.example.invalid','https://user:pass@account.example.invalid','https://account.example.invalid/path','https://account.example.invalid/?x=1','not a url']){
  const url=new URL('https://account.example.invalid/auth/google/start');
  const response=await handleAuth(new Request(url),{...env,GOOGLE_APP_ORIGIN:origin},url);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'auth_origin_invalid');
 }
});
test('changing the configured origin invalidates an in-flight OAuth transaction before token exchange',async()=>{
 const base='https://smarttrade-ai-preview.goshen-r.workers.dev';
 const start=new URL(base+'/auth/google/start');
 const response=await handleAuth(new Request(start),env,start);
 const state=new URL(response.headers.get('location')).searchParams.get('state');
 const cookie=response.headers.get('set-cookie').split(';')[0];
 const callback=new URL('https://account.example.invalid/auth/google/callback?code=offline&state='+state);
 const result=await handleAuth(new Request(callback,{headers:{cookie}}),{...env,GOOGLE_APP_ORIGIN:callback.origin},callback);
 assert.equal(result.status,401);
 assert.equal((await result.json()).error,'invalid_oauth_state');
});
