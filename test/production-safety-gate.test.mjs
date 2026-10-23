import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const production = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const productionWorker = readFileSync(new URL('../cloudflare/src/index.js', import.meta.url), 'utf8');
const preview = JSON.parse(readFileSync(new URL('../wrangler.preview.json', import.meta.url), 'utf8'));
const previewWorker = readFileSync(new URL('../cloudflare/src/preview.js', import.meta.url), 'utf8');

test('production promotion gate remains closed until paid quote transport is removed', () => {
  assert.equal(preview.name, 'smarttrade-ai-preview');
  assert.equal(preview.main, 'cloudflare/src/preview.js');
  assert.match(previewWorker, /getAuthorizedSession/);
  assert.match(previewWorker, /MARKET_QUOTA_GUARD_READY/);
  // This test intentionally FAILS for the current production target.
  // A green check must require removing provider calls from the actual production entrypoint.
  assert.doesNotMatch(productionWorker, /api\.twelvedata\.com|TWELVE_DATA_API_KEY|SMARTTRADE_ACCESS_TOKEN/,
    'Production Worker still includes external quote transport or paid-provider credentials');
  assert.doesNotMatch(production, /main\s*=\s*"cloudflare\/src\/index\.js"/,
    'Production still targets the legacy quote gateway');
});
