import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../preview-public/index.html',import.meta.url),'utf8');
const start=html.indexOf('function validateLegacyPortfolioBackup(');
const end=html.indexOf("el('portfolioRestore').onclick",start);
assert.ok(start>=0&&end>start);
const context=vm.createContext({A:[{id:'WORLD'},{id:'SP500'},{id:'TA125'},{id:'GOV'},{id:'CASH'}],Set,Object,Number,Math});
vm.runInContext(html.slice(start,end),context);
const validate=context.validateLegacyPortfolioBackup;
const backup=()=>({version:'0.5',limit:'45',state:{cash:14900,units:{WORLD:1},trades:[{date:'24.10.2026',side:'buy',id:'WORLD',qty:1,sum:100}]}});
test('accepts an internally consistent local portfolio backup',()=>{
 const r=validate(backup());
 assert.equal(r.valid,true);
 assert.equal(r.state.cash,14900);
 assert.equal(r.state.units.WORLD,1);
});
test('rejects unexpected symbols and inconsistent cash/holdings',()=>{
 const a=backup();a.state.units.EVIL=1;assert.equal(validate(a).valid,false);
 const b=backup();b.state.cash=100;assert.equal(validate(b).valid,false);
 const c=backup();c.state.units.WORLD=3;assert.equal(validate(c).valid,false);
});
test('rejects oversold histories and malformed trade amounts',()=>{
 const a=backup();a.state.trades.push({date:'24.10.2026',side:'sell',id:'WORLD',qty:2,sum:100});assert.equal(validate(a).valid,false);
 const b=backup();b.state.trades[0].sum=Infinity;assert.equal(validate(b).valid,false);
});
test('restore UI requires file and explicit confirmation',()=>{
 assert.match(html,/id="portfolioRestoreFile"/);
 assert.match(html,/file\.size>1000000/);
 assert.match(html,/if\(!confirm\(/);
});
