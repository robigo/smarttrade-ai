import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPortfolioRisk} from '../app/portfolio-risk.mjs';
test('computes total exposure and per-position concentration',()=>{
 const r=assessPortfolioRisk({cashCents:50000,positions:{AAPL:2,MSFT:1}},{AAPL:20000,MSFT:10000});
 assert.equal(r.valid,true);
 assert.equal(r.totalCents,100000);
 assert.equal(r.exposurePct,50);
 assert.equal(r.positions.find(x=>x.symbol==='AAPL').overLimit,true);
 assert.equal(r.overExposureLimit,false);
});
test('rejects missing quotes, overflow and invalid limits',()=>{
 const p={cashCents:100,positions:{AAPL:2}};
 assert.equal(assessPortfolioRisk(p,{}).valid,false);
 assert.equal(assessPortfolioRisk(p,{AAPL:Number.MAX_SAFE_INTEGER}).valid,false);
 assert.equal(assessPortfolioRisk(p,{AAPL:100},{maxPositionPct:0}).valid,false);
});
test('never modifies portfolio or prices',()=>{
 const p=Object.freeze({cashCents:1000,positions:Object.freeze({AAPL:1})});
 const prices=Object.freeze({AAPL:100});
 assert.equal(assessPortfolioRisk(p,prices).valid,true);
 assert.equal(p.cashCents,1000);
 assert.equal(prices.AAPL,100);
});
