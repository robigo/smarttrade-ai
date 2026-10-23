import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAuth, getAuthorizedSession } from '../cloudflare/src/auth.js';

const base = 'https://smarttrade-ai-preview.goshen-r.workers.dev';
const configured = {
  GOOGLE_CLIENT_ID: 'offline-test-client',
  GOOGLE_CLIENT_SECRET: 'offline-test-secret',
  GOOGLE_SESSION_SECRET: 'x'.repeat(48),
  GOOGLE_ALLOWED_EMAIL: 'allowed@example.invalid'
};
const request = (path, headers = {}) => new Request(base + path, { headers });

test('auth fails closed when credentials are missing', async () => {
  const response = await handleAuth(request('/auth/google/start'), {}, new URL(base + '/auth/google/start'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'auth_not_configured' });
});

test('Google authorization redirects to Google with secure state cookie and Preview callback', async () => {
  const path = '/auth/google/start';
  const response = await handleAuth(request(path), configured, new URL(base + path));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('redirect_uri'), base + '/auth/google/callback');
  assert.equal(location.searchParams.get('response_type'), 'code');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(location.searchParams.get('state'));
  assert.ok(location.searchParams.get('nonce'));
  const cookie = response.headers.get('set-cookie');
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax']) assert.ok(cookie.includes(flag));
});

test('callback rejects missing or mismatched OAuth state without calling token endpoint', async () => {
  const path = '/auth/google/callback?code=offline-test&state=invalid';
  const response = await handleAuth(request(path), configured, new URL(base + path));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'invalid_oauth_state');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('protected market sessions fail closed without a valid signed cookie', async () => {
  assert.equal(await getAuthorizedSession(request('/api/market/status'), configured), null);
  assert.equal(await getAuthorizedSession(request('/api/market/status', {cookie: 'st_session=invalid'}), configured), null);
});
