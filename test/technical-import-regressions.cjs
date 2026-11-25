const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('preview-public/index.html','utf8');
const asOf=new Date().toISOString();
const ranking={asOf,source:'https://example.com/',companies:Array.from({length:20},(_,i)=>({symbol:'TEST'+i,name:'Synthetic '+i,marketCap:100-i}))};
const analysis={symbol:'TEST0',asOf,price:100,changePct:1,score:60,indicators:{RSI:50,MACD:0,MA20:99,MA50:98,MA200:97,ADX:20},closes:[{date:'2020-01-01',price:99},{date:'2020-01-02',price:100}],support:[90],resistance:[110],scenarios:{bullish:'test',neutral:'test',bearish:'test'},business:'synthetic',summary:'synthetic',risk:'test',sources:['https://example.com/']};
(async()=>{
 const browser=await chromium.launch();const results=[];
 async function check(name,run){const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const url=new URL(route.request().url());assert.equal(url.origin,'https://test.invalid');return route.fulfill(url.pathname==='/auth/me'?{json:{authenticated:false}}:{contentType:'text/html',body:source})});
  try{await page.goto('https://test.invalid');await page.locator('#ranking').fill(JSON.stringify(ranking));await page.locator('#loadRank').click();assert.equal(await page.locator('#symbol option').count(),20);await run(page);assert.deepEqual(errors,[]);results.push({name,passed:true})}catch(error){results.push({name,passed:false,error:error.message})}finally{await context.close()}
 }
 async function load(page,value){await page.locator('#analysis').fill(JSON.stringify(value));await page.locator('#load').click()}
 try{
  await check('missing optional market values remain explicitly unavailable',async page=>{await load(page,{...analysis,price:null,changePct:null,score:null,closes:[],indicators:{RSI:null,MACD:null,MA20:null,MA50:null,MA200:null,ADX:null}});assert.equal(await page.locator('#result').isVisible(),true);assert.equal(await page.locator('#score').isVisible(),false);assert.match(await page.locator('#price').textContent(),/לא זמין/)});
  await check('reject impossible RSI',async page=>{await load(page,{...analysis,indicators:{...analysis.indicators,RSI:101}});assert.equal(await page.locator('#result').isVisible(),false)});
  await check('reject nonpositive moving average',async page=>{await load(page,{...analysis,indicators:{...analysis.indicators,MA20:-1}});assert.equal(await page.locator('#result').isVisible(),false)});
  await check('reject closing dates after the analysis timestamp',async page=>{await load(page,{...analysis,closes:[{date:'2099-01-01',price:99},{date:'2099-01-02',price:100}]});assert.equal(await page.locator('#result').isVisible(),false)});
  await check('invalid ranking draft cannot corrupt previously accepted research on reload',async page=>{await load(page,analysis);await page.locator('#ranking').fill('{"invalid":true}');await page.locator('#loadRank').click();await load(page,analysis);await page.reload();assert.equal(await page.locator('#result').isVisible(),true);assert.equal(await page.locator('#name').textContent(),'TEST0')});
  await check('storage denial is reported instead of a successful save',async page=>{await page.evaluate(()=>Storage.prototype.setItem=()=>{throw new Error('storage denied')});await load(page,analysis);assert.match(await page.locator('#status').textContent(),/לא ניתן לשמור|לא נשמר/)});
 }finally{await browser.close()}
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/import-regressions.json',JSON.stringify({head:process.env.GITHUB_SHA||'local-candidate',results,providerRequests:0,productionWrites:0},null,2));
 for(const result of results)console.log((result.passed?'PASS ':'FAIL ')+result.name);if(results.some(result=>!result.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1});

