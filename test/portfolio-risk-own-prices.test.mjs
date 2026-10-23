import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPortfolioRisk} from '../app/portfolio-risk.mjs';
test('inherited quote values cannot be used for paper portfolio valuation',()=>{
 const prices=Object.create({AAPL:10000});
 const result=assessPortfolioRisk({cashCents:50000,positions:{AAPL:1}},prices);
 assert.equal(result.valid,false);
 assert.equal(result.reason,'missing_or_invalid_price');
});
