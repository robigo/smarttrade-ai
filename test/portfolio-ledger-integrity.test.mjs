import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPortfolio,executePaperTrade} from '../app/portfolio-engine.mjs';
import {validatePortfolioLedger} from '../app/portfolio-ledger-integrity.mjs';

function build(){
 let p=initialPortfolio();
 for(const order of [
  {symbol:'AAPL',side:'buy',quantity:3,priceCents:12000},
  {symbol:'MSFT',side:'buy',quantity:2,priceCents:9000},
  {symbol:'AAPL',side:'sell',quantity:1,priceCents:13000},
 ]){
  const step=executePaperTrade(p,order);
  assert.equal(step.accepted,true);
  p=step.portfolio;
 }
 return p;
}
test('accepts replayed trades with exact cash and positions, without mutation',()=>{
 const p=build();const before=structuredClone(p);
 assert.deepEqual(validatePortfolioLedger(p),{valid:true});
 assert.deepEqual(p,before);
});
test('rejects tampered holdings and cash even with valid field types',()=>{
 const p=build();
 assert.equal(validatePortfolioLedger({...p,cashCents:p.cashCents+1}).reason,'cash_mismatch');
 assert.equal(validatePortfolioLedger({...p,positions:{...p.positions,AAPL:9}}).reason,'positions_mismatch');
 assert.equal(validatePortfolioLedger({...p,positions:{...p.positions,SPY:0}}).reason,'noncanonical_position');
});
test('rejects overselling, impossible cost, and invalid trades',()=>{
 const p=build();
 const extra={symbol:'AAPL',side:'sell',quantity:3,priceCents:20000};
 assert.equal(validatePortfolioLedger({...p,trades:[...p.trades,extra]}).reason,'invalid_trade_history');
 const impossible={symbol:'SPY',side:'buy',quantity:99999999,priceCents:100000};
 assert.equal(validatePortfolioLedger({...p,trades:[...p.trades,impossible]}).reason,'invalid_trade_history');
});
test('accepts initialized portfolio and rejects oversized transaction histories',()=>{
 assert.equal(validatePortfolioLedger(initialPortfolio()).valid,true);
 const p=initialPortfolio();
 const trade={symbol:'AAPL',side:'buy',quantity:1,priceCents:1};
 assert.equal(validatePortfolioLedger({...p,trades:Array(10001).fill(trade)}).reason,'too_many_trades');
});
