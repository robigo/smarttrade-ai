import test from 'node:test';
import assert from 'node:assert/strict';
import {valuePaperPortfolio} from '../app/portfolio-valuation.mjs';
test('portfolio valuation reconciles cash and holdings',()=>{
 const r=valuePaperPortfolio({cashCents:50000,positions:{AAPL:2}},{AAPL:12500});
 assert.equal(r.valid,true);
 assert.equal(r.totalCents,75000);
 assert.equal(r.investedCents,25000);
 assert.equal(r.holdings[0].valueCents,25000);
});
test('missing price blocks valuation rather than silently using zero',()=>{
 const r=valuePaperPortfolio({cashCents:50000,positions:{AAPL:2}},{});
 assert.equal(r.valid,false);
 assert.equal(r.reason,'missing_or_invalid_price');
});
