import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePortfolioSnapshot} from '../app/portfolio-snapshot.mjs';
test('accepts an empty initialized paper portfolio',()=>{
 assert.deepEqual(validatePortfolioSnapshot({cashCents:1500000,positions:{},trades:[]}),{valid:true});
});
test('rejects malformed restored data',()=>{
 for(const s of [
 null,{}, {cashCents:-1,positions:{},trades:[]},
 {cashCents:0,positions:{AAPL:-1},trades:[]},
 {cashCents:0,positions:{AAPL:1.5},trades:[]},
 {cashCents:0,positions:[],trades:[]},
 {cashCents:0,positions:{},trades:[{symbol:'AAPL',side:'buy',quantity:0,priceCents:100}]}
 ])assert.equal(validatePortfolioSnapshot(s).valid,false);
});
