import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
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
  assert.equal(new URL(page.url()).origin, 'http://127.0.0.1:8765');
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await page.route('**/health', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', service: 'smarttrade-ai-preview' })
  }));
  await page.locator('#checkGateway').click();
  await assert.doesNotReject(() => page.locator('#gatewayState').getByText('שרת הנתונים פעיל', { exact: false }).waitFor());
  await page.unrouteAll();
  
  assert.deepEqual(errors, [], 'Unexpected browser errors');
  console.log('Preview UI smoke tests passed (local static assets; no real trades).');
} finally {
  await browser.close();
}
