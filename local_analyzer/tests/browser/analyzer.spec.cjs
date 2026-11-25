const {test,expect}=require('@playwright/test');
const origin='http://127.0.0.1:8766';
test.describe.configure({mode:'serial'});
test.beforeEach(async({page,context})=>{
 const errors=[],unexpected=[],calls=[];page.on('pageerror',error=>errors.push(error.message));
 await context.addInitScript(()=>localStorage.setItem('smarttrade-v02','unchanged-legacy-fixture'));
 await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin){unexpected.push(url.origin);return route.abort()}calls.push(url.pathname);return route.continue()});
 page.evidence={errors,unexpected,calls};await page.goto('/');await expect(page.locator('#requestStatus')).not.toContainText('טוען');
});
test.afterEach(async({page})=>{expect(page.evidence.errors).toEqual([]);expect(page.evidence.unexpected).toEqual([]);expect(await page.evaluate(()=>localStorage.getItem('smarttrade-v02'))).toBe('unchanged-legacy-fixture')});
test('cached actual-backend analysis opens without provider polling and manual refresh is rate limited',async({page})=>{
 await expect(page.locator('#instrumentSymbol')).toHaveText('NVDA');await expect(page.locator('#lastPrice')).not.toBeEmpty();await expect(page.locator('#dataOrigin')).toContainText('TEST FIXTURE');
 expect(page.evidence.calls).not.toContain('/api/refresh');await expect(page.locator('#indicatorRows tr')).toHaveCount(15);await expect(page.locator('#scoreText')).not.toHaveText('—');
 await expect(page.locator('#fundamentals')).toContainText('טרם נטענו');await page.locator('#refresh').click();await expect(page.locator('#refresh')).toBeEnabled();
 const price=await page.locator('#lastPrice').textContent();await page.locator('#refresh').click();await expect(page.locator('#error')).toContainText('המתן דקה');await expect(page.locator('#lastPrice')).toHaveText(price);
});
test('symbol change, candles, overlay selection, zoom and date navigation work',async({page})=>{
 await page.locator('#symbolSelect').selectOption('AAPL');await expect(page.locator('#empty')).toBeVisible();
 await page.locator('#refresh').click();await expect(page.locator('#instrumentSymbol')).toHaveText('AAPL');await expect(page.locator('#analysisPanel')).toBeVisible();
 await page.locator('#range').selectOption('252');await expect(page.locator('#priceChart [data-candle]')).toHaveCount(252);
 await page.locator('#show200').check();await expect(page.locator('[data-series=ma200]')).toHaveCount(1);await page.locator('#showBB').check();await expect(page.locator('[data-series=bbUpper]')).toHaveCount(1);
 await page.locator('#chartType').selectOption('line');await expect(page.locator('[data-series=close]')).toHaveCount(1);
 await page.locator('#range').selectOption('66');const range=await page.locator('#pointCount').textContent();await page.locator('#older').click();await expect(page.locator('#pointCount')).not.toHaveText(range);await page.locator('#newer').click();await expect(page.locator('#pointCount')).toHaveText(range);
 const point=page.locator('#priceChart .hit').first();await point.focus();await expect(page.locator('#barDetails')).toContainText('פתיחה');
 await page.locator('#priceChart').hover();await page.mouse.wheel(0,-200);await expect.poll(()=>page.locator('#priceChart .hit').count()).toBeLessThan(66);
});
test('provider failure preserves the last valid cached analysis',async({page})=>{
 await page.locator('#symbolSelect').selectOption('AMZN');await expect(page.locator('#instrumentSymbol')).toHaveText('AMZN');const price=await page.locator('#lastPrice').textContent();
 await page.locator('#refresh').click();await expect(page.locator('#error')).toContainText('TEST provider unavailable');await expect(page.locator('#lastPrice')).toHaveText(price);
});
test('CSV import persists, invalid CSV preserves data, and historical viewing does not replace latest',async({page})=>{
 const lines=['Date,Open,High,Low,Close,Volume'];for(let index=0;index<260;index++){const date=new Date(Date.UTC(2021,0,1)+index*86400000).toISOString().slice(0,10),price=100+index*.2;lines.push([date,price,price+1,price-1,price+.1,1000+index].join(','))}
 await page.getByText('ייבוא CSV של נתונים יומיים',{exact:true}).click();await page.locator('#csvSource').fill('Synthetic CSV test data');await page.locator('#csvFile').setInputFiles({name:'test.csv',mimeType:'text/csv',buffer:Buffer.from(lines.join('\n'))});await page.locator('#importCSV').click();
 await expect(page.locator('#dataOrigin')).toHaveText('Synthetic CSV test data');const price=await page.locator('#lastPrice').textContent();
 await page.locator('#csvFile').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('<html>not prices</html>')});await page.locator('#importCSV').click();await expect(page.locator('#error')).toContainText('כותרות CSV');await expect(page.locator('#lastPrice')).toHaveText(price);
 await page.reload();await expect(page.locator('#dataOrigin')).toHaveText('Synthetic CSV test data');await expect(page.locator('#historyRows button')).toHaveCount(2);
 await page.locator('#historyRows button').last().click();await expect(page.locator('#dataOrigin')).toContainText('גרסה היסטורית');await expect(page.locator('#lastPrice')).not.toHaveText(price);await page.reload();await expect(page.locator('#lastPrice')).toHaveText(price);
});
test('TOP 20 import is explicitly unverified and rejects duplicates',async({page})=>{
 await page.getByText('TOP 20 — ייבוא דירוג שווי שוק',{exact:true}).click();const value={asOf:new Date().toISOString(),source:'https://example.com/test-data',companies:Array.from({length:20},(_,i)=>({symbol:'TEST'+i,name:'Synthetic '+i,marketCap:100-i}))};
 await page.locator('#ranking').fill(JSON.stringify(value));await page.locator('#importRanking').click();await expect(page.locator('#rankingStatus')).toContainText('לא אומתה');await expect(page.locator('#rankingNote')).toContainText('לא אומת עצמאית');
 value.companies[1].symbol='TEST0';await page.locator('#ranking').fill(JSON.stringify(value));await page.locator('#importRanking').click();await expect(page.locator('#rankingStatus')).toContainText('ייחודיות');
});
for(const width of [390,768,1440])test('research layout at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:1000});await page.locator('[data-symbol=NVDA]').click();await expect(page.locator('#analysisPanel')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await page.locator('#priceChart').boundingBox()).height).toBeGreaterThan(300);
 await page.screenshot({path:'artifacts/analyzer-browser/analyzer-'+width+'.png',fullPage:true});
});
