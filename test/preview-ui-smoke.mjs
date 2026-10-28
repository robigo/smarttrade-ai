import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base=process.env.SMOKE_BASE||'http://127.0.0.1:8765';
const deployed=base==='https://smarttrade-ai-preview.goshen-r.workers.dev';
assert.ok(deployed||base==='http://127.0.0.1:8765','Only local assets or isolated Preview may be tested');
async function verifyRevision(){
  if(!deployed)return;
  assert.match(process.env.EXPECTED_SHA||'',/^[0-9a-f]{40}$/);
  const response=await fetch(base+'/health',{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000)});
  assert.equal(response.status,200);
  const health=await response.json();
  assert.equal(health.service,'smarttrade-ai-preview');
  assert.equal(health.revision,process.env.EXPECTED_SHA,'Deployed SHA differs from tested source');
}
await verifyRevision();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base+'/', { waitUntil: 'domcontentloaded' });
  assert.match(await page.title(), /SmartTrade AI/);
  assert.match(await page.locator('#cash').innerText(), /15,000/);

  await page.locator('#asset').selectOption('GOV');
  await page.locator('#side').selectOption('buy');
  await page.locator('#qty').fill('2');
  await page.locator('#trade').click();
  assert.match(await page.locator('#msg').innerText(), /העסקה המדומה נרשמה/);
  assert.match(await page.locator('#cash').innerText(), /14,800/);
  assert.equal(await page.locator('#history tr').count(), 1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.match(await page.locator('#cash').innerText(), /14,800/);
  assert.equal(await page.locator('#history tr').count(), 1);

  await page.locator('#asset').selectOption('GOV');
  await page.locator('#side').selectOption('sell');
  await page.locator('#qty').fill('1');
  await page.locator('#trade').click();
  assert.match(await page.locator('#cash').innerText(), /14,900/);
  assert.equal(await page.locator('#history tr').count(), 2);

  await page.locator('#asset').selectOption('WORLD');
  await page.locator('#side').selectOption('buy');
  await page.locator('#qty').fill('100');
  await page.locator('#limit').selectOption('45');
  await page.locator('#trade').click();
  assert.match(await page.locator('#msg').innerText(), /חריגה מתקרת המניות/);
  assert.match(await page.locator('#cash').innerText(), /14,900/);
  assert.equal(await page.locator('#history tr').count(), 2);

  await page.locator('#side').selectOption('sell');
  await page.locator('#qty').fill('1');
  await page.locator('#trade').click();
  assert.match(await page.locator('#msg').innerText(), /אין מספיק יחידות/);
  assert.equal(await page.locator('#history tr').count(), 2);

  // Same-origin auth navigation must not reference an undefined AUTH_BASE.
  await page.route('**/auth/google/start', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<title>Mock Google auth start</title>'
  }));
  await page.locator('#googleLogin').click();
  await page.waitForURL('**/auth/google/start');
  assert.equal(new URL(page.url()).origin, base);
  await page.goto(base+'/', { waitUntil: 'domcontentloaded' });
  await page.route('**/health', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', service: 'smarttrade-ai-preview' })
  }));
  await page.locator('#checkGateway').click();
  await assert.doesNotReject(() => page.locator('#gatewayState').getByText('שרת הנתונים פעיל', { exact: false }).waitFor());
  await page.unrouteAll();
  
  assert.deepEqual(errors, [], 'Unexpected browser errors');
  await verifyRevision();
  console.log('Preview UI smoke tests passed (browser simulation; no real trades).');
} finally {
  await browser.close();
}
