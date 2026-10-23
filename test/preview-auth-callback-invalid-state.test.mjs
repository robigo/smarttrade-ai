import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuth} from '../cloudflare/src/auth.js';

const base='https://smarttrade-ai-preview.goshen-r.workers.dev';
const env={
 GOOGLE_CLIENT_ID:'dummy-client',
 GOOGLE_CLIENT_SECRET:'dummy-secret',
 GOOGLE_SESSION_SECRET:'s'.repeat(40),
 GOOGLE_ALLOWED_EMAIL:'tester@example.invalid'
};
async function invoke(path,options={}){
 const request=new Request(base+path,options);
 return handleAuth(request,env,new URL(request.url));
}
test('callback without OAuth state or transaction fails closed',async()=>{
 const response=await invoke('/auth/google/callback?code=invalid&state=invalid');
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{error:'invalid_oauth_state'});
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('callback with malformed transaction cookie fails without token exchange',async()=>{
 const response=await invoke('/auth/google/callback?code=invalid&state=invalid',{
  headers:{cookie:'st_oauth=malformed.value'}
 });
 assert.equal(response.status,401);
 assert.equal((await response.json()).error,'invalid_oauth_state');
});
test('auth routes reject unsupported methods and absent configuration',async()=>{
 const method=await invoke('/auth/me',{method:'POST'});
 assert.equal(method.status,405);
 const request=new Request(base+'/auth/me');
 const missing=await handleAuth(request,{},new URL(request.url));
 assert.equal(missing.status,503);
 assert.equal((await missing.json()).error,'auth_not_configured');
});

test('logout clears session cookie and redirects to same-origin preview UI',async()=>{
 const response=await invoke('/auth/logout',{headers:{cookie:'st_session=malformed'}});
 assert.equal(response.status,302);
 assert.equal(response.headers.get('location'),base+'/');
 const cookie=response.headers.get('set-cookie')||'';
 assert.match(cookie,/st_session=;/);
 assert.match(cookie,/Max-Age=0/);
 assert.match(cookie,/HttpOnly/);
 assert.match(cookie,/Secure/);
 assert.match(cookie,/SameSite=Lax/);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('invalid or missing session fails closed on auth status',async()=>{
 for(const headers of [{},{cookie:'st_session=forged.payload'}]){
  const response=await invoke('/auth/me',{headers});
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{authenticated:false});
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
});
