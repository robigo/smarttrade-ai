import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PERSONAL_MARKET_INSTRUMENTS,PERSONAL_SYMBOLS} from '../app/personal-market-symbols.mjs';
import {buildExistingProductionHtml} from '../scripts/build-existing-production-assets.mjs';
test('quote and watch selectors match the server catalog without expanding the simulation assets',()=>{
 const input=fs.readFileSync(new URL('../preview-public/index.html',import.meta.url),'utf8');
 const output=buildExistingProductionHtml(input);
 for(const id of ['liveSymbol','watchChoice']){
  const content=output.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'))[1];
  assert.deepEqual([...content.matchAll(/<option value="([A-Z]+)">/g)].map(x=>x[1]),PERSONAL_SYMBOLS);
 }
 assert.equal(new Set(PERSONAL_SYMBOLS).size,PERSONAL_SYMBOLS.length);
 assert.ok(PERSONAL_MARKET_INSTRUMENTS.every(x=>x.currency==='USD'));
 assert.match(output,/watchAllowed=\["AAPL","MSFT","NVDA"/);
 assert.ok(output.includes("watchList=['AAPL','MSFT','SPY']"));
 assert.ok(output.includes("const A=[{id:'WORLD'"));
 assert.ok(!input.includes('NVDA — NVIDIA'));
});
