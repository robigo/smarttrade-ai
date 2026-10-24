import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRealizedPnl} from '../app/portfolio-realized-pnl.mjs';
test('FIFO recognizes gain and preserves the second cost lot',()=>{
 const t=[
  {symbol:'AAPL',side:'buy',quantity:2,priceCents:10000},
  {symbol:'AAPL',side:'buy',quantity:2,priceCents:15000},
  {symbol:'AAPL',side:'sell',quantity:3,priceCents:20000}
 ];
 const before=structuredClone(t);
 assert.deepEqual(calculateRealizedPnl(t),{valid:true,realizedCents:25000,remainingPositions:{AAPL:1}});
 assert.deepEqual(t,before);
});
test('realized losses remain negative and symbol lots are independent',()=>{
 const r=calculateRealizedPnl([
  {symbol:'MSFT',side:'buy',quantity:1,priceCents:20000},
  {symbol:'AAPL',side:'buy',quantity:2,priceCents:10000},
  {symbol:'MSFT',side:'sell',quantity:1,priceCents:15000}
 ]);
 assert.equal(r.realizedCents,-5000);
 assert.deepEqual(r.remainingPositions,{AAPL:2});
});
test('reject oversells, invalid trade fields and multiplication overflow',()=>{
 const cases=[
  [{symbol:'AAPL',side:'sell',quantity:1,priceCents:100}],
  [{symbol:'AAPL',side:'buy',quantity:-1,priceCents:100}],
  [{symbol:'AAPL',side:'buy',quantity:Number.MAX_SAFE_INTEGER,priceCents:2}],
  [{symbol:'aapl',side:'buy',quantity:1,priceCents:100}]
 ];
 for(const c of cases) assert.equal(calculateRealizedPnl(c).valid,false);
});
