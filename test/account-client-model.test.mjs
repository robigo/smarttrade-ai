import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {executePaperTrade,initialPortfolio} from '../app/portfolio-engine.mjs';
import {validatePortfolioLedger} from '../app/portfolio-ledger-integrity.mjs';
const code=fs.readFileSync(new URL('../preview-public/account-client.js',import.meta.url),'utf8');
const ctx=vm.createContext({});
vm.runInContext(code.slice(code.indexOf('// MODEL START'),code.indexOf('// MODEL END')),ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
const legacy=()=>({cash:14800,units:{WORLD:2},trades:[{id:'WORLD',side:'buy',qty:2,sum:200}]});
test('legacy ILS/whole-share conversion preserves amounts and does not mutate source',()=>{
 const original=legacy(),before=JSON.stringify(original);
 const converted=ctx.accountFromLegacy(original,['WORLD']);
 assert.equal(converted.cashCents,1480000);
 assert.equal(converted.positions.WORLD,2);
 assert.equal(converted.trades[0].priceCents,10000);
 assert.equal(validatePortfolioLedger(converted).valid,true);
 assert.equal(JSON.stringify(original),before);
});
test('fractional legacy holdings and prices with fractional cents are explicitly rejected',()=>{
 const fractional=legacy();fractional.units.WORLD=0.5;
 assert.throws(()=>ctx.accountFromLegacy(fractional,['WORLD']),/יחידות שלמות/);
 const amount=legacy();amount.trades[0].sum=200.001;
 assert.throws(()=>ctx.accountFromLegacy(amount,['WORLD']),/שברי אגורה/);
});
test('conversion rejects unknown symbols and histories inconsistent with cash',()=>{
 assert.throws(()=>ctx.accountFromLegacy(legacy(),['GOV']));
 const bad=legacy();bad.cash=15000;
 assert.throws(()=>ctx.accountFromLegacy(bad,['WORLD']),/היסטוריה/);
});
test('client buy/sell results agree with the server engine and ledger validation',()=>{
 let client=initialPortfolio(),server=initialPortfolio();
 for(const order of [
  {symbol:'WORLD',side:'buy',quantity:2,priceCents:10000},
  {symbol:'GOV',side:'buy',quantity:1,priceCents:10000},
  {symbol:'WORLD',side:'sell',quantity:1,priceCents:12000},
 ]){
  client=ctx.accountTrade(client,order);
  server=executePaperTrade(server,order).portfolio;
  assert.deepEqual(plain(client),server);
  assert.equal(validatePortfolioLedger(client).valid,true);
 }
});
test('overselling, insufficient cash, corrupt snapshots and fractional trades are rejected',()=>{
 for(const order of [
  {symbol:'WORLD',side:'sell',quantity:1,priceCents:10000},
  {symbol:'WORLD',side:'buy',quantity:999,priceCents:10000},
  {symbol:'WORLD',side:'buy',quantity:0.5,priceCents:10000},
 ])assert.throws(()=>ctx.accountTrade(initialPortfolio(),order));
 assert.throws(()=>ctx.accountValidateSnapshot({cashCents:1500000,positions:{WORLD:1},trades:[]}));
});
