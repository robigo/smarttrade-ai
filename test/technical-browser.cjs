const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
 for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://test.invalid/**',route=>route.fulfill(route.request().url().endsWith('/auth/me')?{json:{authenticated:true}}:{contentType:'text/html',body:fs.readFileSync('preview-public/index.html','utf8')}));
 await page.goto('https://test.invalid/');
 await page.waitForFunction(()=>document.getElementById('taLogout').hidden===false);
 const asOf=new Date().toISOString();
 const companies=Array.from({length:20},(_,i)=>({symbol:'TEST'+i,name:'Synthetic '+i,marketCap:100-i}));
 const ranking={asOf,source:'https://example.com/',companies};
 await page.locator('#ranking').fill(JSON.stringify(ranking));await page.locator('#loadRank').click();
 assert.equal(await page.locator('#symbol option').count(),20);
 const a={symbol:'TEST0',asOf,price:100,changePct:1,score:60,indicators:{RSI:50,MACD:0,MA20:99,MA50:98,MA200:97,ADX:20},closes:[{date:'2020-01-01',price:99},{date:'2020-01-02',price:100}],support:[90],resistance:[110],scenarios:{bullish:'test',neutral:'test',bearish:'test'},business:'synthetic',summary:'synthetic',risk:'test',sources:['https://example.com/']};
 await page.locator('#analysis').fill(JSON.stringify({...a,score:101}));await page.locator('#load').click();assert.equal(await page.locator('#result').isVisible(),false);
 await page.locator('#analysis').fill(JSON.stringify(a));await page.locator('#load').click();assert.equal(await page.locator('#result').isVisible(),true);assert.equal(await page.locator('#chart polyline').count(),1);
 await page.reload();assert.equal(await page.locator('#result').isVisible(),true);assert.equal(await page.locator('#name').textContent(),'TEST0');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);await page.close();console.log('PASS viewport '+width);
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
