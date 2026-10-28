import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuth} from '../cloudflare/src/auth.js';

const rcOrigin = 'https://smarttrade-ai-rc.goshen-r.workers.dev';
const productionOrigin = 'https://smarttrade-ai.goshen-r.workers.dev';
const fixture = {
  GOOGLE_CLIENT_ID: '123456789-testclient.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fake-test-secret-not-real',
  GOOGLE_SESSION_SECRET: 'fake-session-secret-for-offline-testing-0123456789',
  GOOGLE_ALLOWED_EMAIL: 'only-test@example.invalid',
  AUTH_PUBLIC_ORIGIN: rcOrigin,
};

test('RC OAuth start constructs validated redirect and PKCE without exposing credentials', async () => {
  const url = new URL(rcOrigin + '/auth/google/start');
  const response = await handleAuth(new Request(url), fixture, url);
  assert.equal(response.status, 302);
  const uri = new URL(response.headers.get('location'));
  assert.equal(uri.origin, 'https://accounts.google.com');
  assert.equal(uri.pathname, '/o/oauth2/v2/auth');
  assert.equal(uri.searchParams.get('client_id'), fixture.GOOGLE_CLIENT_ID);
  assert.equal(uri.searchParams.get('redirect_uri'), rcOrigin + '/auth/google/callback');
  assert.equal(uri.searchParams.get('response_type'), 'code');
  assert.equal(uri.searchParams.get('scope'), 'openid email profile');
  assert.equal(uri.searchParams.get('code_challenge_method'), 'S256');
  assert.match(uri.searchParams.get('code_challenge') || '', /^[A-Za-z0-9_-]{43}$/);
  assert.ok((uri.searchParams.get('state') || '').length >= 24);
  assert.ok((uri.searchParams.get('nonce') || '').length >= 24);
  assert.equal(uri.searchParams.has('client_secret'), false);
  assert.ok(response.headers.get('set-cookie')?.includes('HttpOnly'));
  assert.ok(response.headers.get('set-cookie')?.includes('Secure'));
});

test('RC configured origin cannot be reused on Production host', async () => {
  const url = new URL(productionOrigin + '/auth/google/start');
  const res = await handleAuth(new Request(url), fixture, url);
  assert.equal(res.status, 503);
});
