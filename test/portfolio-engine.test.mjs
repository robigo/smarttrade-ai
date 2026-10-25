import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPortfolio,executePaperTrade,STARTING_CASH_CENTS} from '../app/portfolio-engine.mjs';
test('buy and sell paper units without mutating previous snapshots',()=>{
 const initial=initialPortfolio();
 const buy=executePaperTrade(initial,{symbol:'AAPL',side:'buy',quantity:2,priceCents:10000});
 assert.equal(buy.accepted,true);
 assert.equal(buy.portfolio.cashCents,STARTING_CASH_CENTS-20000);
 assert.equal(initial.positions.AAPL,undefined);
 const sell=executePaperTrade(buy.portfolio,{symbol:'AAPL',side:'sell',quantity:2,priceCents:12000});
 assert.equal(sell.accepted,true);
 assert.equal(sell.portfolio.positions.AAPL,undefined);
 assert.equal(sell.portfolio.cashCents,STARTING_CASH_CENTS+4000);
});
test('insufficient cash, overselling and unsafe amounts are rejected',()=>{
 const p=initialPortfolio();
 for(const order of [
 {symbol:'AAPL',side:'buy',quantity:100000,priceCents:100000},
 {symbol:'AAPL',side:'sell',quantity:1,priceCents:100},
 {symbol:'AAPL',side:'buy',quantity:1.5,priceCents:100},
 {symbol:'AAPL',side:'buy',quantity:Number.MAX_SAFE_INTEGER,priceCents:10},
 ])assert.equal(executePaperTrade(p,order).accepted,false);
 assert.deepEqual(p,initialPortfolio());
});
