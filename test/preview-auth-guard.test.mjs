import test from 'node:test';
import assert from 'node:assert/strict';
import preview from '../cloudflare/src/preview.js';

const base = 'https://smarttrade-ai-preview.goshen-r.workers.dev';

test('unauthenticated market endpoints fail closed without provider configuration', async () => {
  for (const path of ['/api/market/status', '/api/market/quote?symbol=AAPL']) {
    const response = await preview.fetch(new Request(base + path), {});
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).error, 'unauthorized');
  }
});

test('invalid market methods are rejected before authentication or provider access', async () => {
  for (const path of ['/api/market/status', '/api/market/quote?symbol=AAPL']) {
    const response = await preview.fetch(new Request(base + path, { method: 'POST' }), {});
    assert.equal(response.status, 405, path);
    assert.equal((await response.json()).error, 'method_not_allowed');
  }
});

test('spoofed session cookie cannot access market quote', async () => {
  const request = new Request(base + '/api/market/quote?symbol=AAPL', {
    headers: { cookie: 'st_session=forged.value' }
  });
  const response = await preview.fetch(request, {
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_SESSION_SECRET: 'a'.repeat(32),
    GOOGLE_ALLOWED_EMAIL: 'test@example.invalid'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'unauthorized');
});
