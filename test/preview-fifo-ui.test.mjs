import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../preview-public/index.html',import.meta.url),'utf8');
const start=html.indexOf('function computeFifoComparison(');
const end=html.indexOf('function performance()',start);
assert.ok(start>=0&&end>start);
const context=vm.createContext({A:[{id:'AAPL'},{id:'MSFT'}],Map,Number});
vm.runInContext(html.slice(start,end),context);
const fifo=context.computeFifoComparison;
test('FIFO realized gain differs from weighted-average accounting',()=>{
 const t=[
  {id:'AAPL',side:'buy',qty:2,sum:200},
  {id:'AAPL',side:'buy',qty:2,sum:400},
  {id:'AAPL',side:'sell',qty:3,sum:450}
 ];
 assert.equal(fifo(t).valid,true);
 assert.equal(fifo(t).realized,50);
});
test('fractional paper shares and negative P&L',()=>{
 const t=[{id:'MSFT',side:'buy',qty:0.5,sum:100},{id:'MSFT',side:'sell',qty:0.25,sum:40}];
 assert.equal(fifo(t).realized,-10);
});
test('rejects oversold and corrupt trades',()=>{
 assert.equal(fifo([{id:'AAPL',side:'sell',qty:1,sum:100}]).valid,false);
 assert.equal(fifo([{id:'AAPL',side:'buy',qty:0,sum:100}]).valid,false);
});
test('FIFO output is wired into paper performance panel',()=>{
 assert.match(html,/id="fifoRealized"/);
 assert.match(html,/computeFifoComparison\(state\.trades\)/);
});
