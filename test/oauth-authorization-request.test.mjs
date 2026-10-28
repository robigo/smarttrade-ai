import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuth} from '../cloudflare/src/auth.js';

const productionOrigin = 'https://smarttrade-ai.goshen-r.workers.dev';
const previewOrigin = 'https://smarttrade-ai-preview.goshen-r.workers.dev';
const fixture = {
  GOOGLE_CLIENT_ID: '123456789-testclient.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fake-test-secret-not-real',
  GOOGLE_SESSION_SECRET: 'fake-session-secret-for-offline-testing-0123456789',
  GOOGLE_ALLOWED_EMAIL: 'only-test@example.invalid',
  AUTH_PUBLIC_ORIGIN: productionOrigin,
};

test('Production OAuth start builds same-origin redirect with PKCE and safe cookie', async () => {
  const url = new URL(productionOrigin + '/auth/google/start');
  const response = await handleAuth(new Request(url), fixture, url);
  assert.equal(response.status, 302);
  const google = new URL(response.headers.get('location'));
  assert.equal(google.origin, 'https://accounts.google.com');
  assert.equal(google.pathname, '/o/oauth2/v2/auth');
  assert.equal(google.searchParams.get('client_id'), fixture.GOOGLE_CLIENT_ID);
  assert.equal(google.searchParams.get('redirect_uri'), productionOrigin + '/auth/google/callback');
  assert.equal(google.searchParams.get('response_type'), 'code');
  assert.equal(google.searchParams.get('scope'), 'openid email profile');
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
  assert.match(google.searchParams.get('code_challenge') || '', /^[A-Za-z0-9_-]{43}$/);
  assert.ok((google.searchParams.get('state') || '').length >= 24);
  assert.ok((google.searchParams.get('nonce') || '').length >= 24);
  assert.equal(google.searchParams.has('client_secret'), false);
  const cookie = response.headers.get('set-cookie') || '';
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});

test('Production credentials cannot be used at Preview origin', async () => {
  const url = new URL(previewOrigin + '/auth/google/start');
  const res = await handleAuth(new Request(url), fixture, url);
  assert.equal(res.status, 503);
});

test('Production callback fails without OAuth state cookie', async () => {
  const url = new URL(productionOrigin + '/auth/google/callback?state=fake&code=fake');
  const res = await handleAuth(new Request(url), fixture, url);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), {error:'invalid_oauth_state'});
});
