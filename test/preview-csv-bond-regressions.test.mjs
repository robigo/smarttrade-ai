import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../preview-public/index.html', import.meta.url), 'utf8');
const csvCode = html.slice(html.indexOf("el('sampleCsv').onclick"), html.indexOf("const FEED_KEY="));

function csvHarness(text) {
  const nodes = new Map();
  const storage = new Map();
  const assets = ['WORLD', 'SP500', 'TA125', 'GOV', 'CASH'].map(id => ({ id, name: id, price: 100 }));
  let downloaded;
  const el = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', files: [], replaceChildren() {}, append() {} });
    return nodes.get(id);
  };
  el('pricesFile').files = [{ text: async () => text }];
  const context = vm.createContext({
    el, A: assets, QKEY: 'prices', PKEY: 'history', priceHistory: [],
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    document: { createElement: () => ({}) },
    portfolio: () => 15000, render() {}, money: value => String(value),
    download: (name, data) => { downloaded = { name, data }; },
  });
  vm.runInContext(csvCode, context);
  return { el, assets, storage, downloaded: () => downloaded };
}

test('CSV template contains a header and five real data lines', () => {
  const h = csvHarness('');
  h.el('sampleCsv').onclick();
  const file = h.downloaded();
  assert.equal(file.name, 'prices-template.csv');
  assert.equal(file.data.trim().split(/\r?\n/).length, 6);
  assert.ok(!file.data.includes('\\n'));
});

for (const [name, prefix, newline] of [['LF', '', '\n'], ['BOM and CRLF', '\uFEFF', '\r\n']]) {
  test(`imports ordinary CSV with ${name}`, async () => {
    const h = csvHarness(prefix + ['symbol,price_ils,date', 'WORLD,120,2026-10-29', 'SP500,260,2026-10-29', ''].join(newline));
    await h.el('pricesFile').onchange();
    assert.match(h.el('priceStatus').textContent, /עודכנו 2/);
    assert.equal(h.assets[0].price, 120);
    assert.equal(h.assets[1].price, 260);
    assert.equal(JSON.parse(h.storage.get('prices')).WORLD, 120);
  });
}

test('downloaded template imports successfully', async () => {
  const source = csvHarness('');
  source.el('sampleCsv').onclick();
  const h = csvHarness(source.downloaded().data);
  await h.el('pricesFile').onchange();
  assert.match(h.el('priceStatus').textContent, /עודכנו 5/);
});

for (const [name, rows] of [
  ['duplicate symbols', ['WORLD,120,2026-10-29', 'WORLD,130,2026-10-29']],
  ['negative price', ['WORLD,120,2026-10-29', 'SP500,-1,2026-10-29']],
  ['unknown symbol', ['WORLD,120,2026-10-29', 'UNKNOWN,1,2026-10-29']],
  ['invalid date format', ['WORLD,120,2026-10-29', 'SP500,260,29/10/2026']],
]) {
  test(`rejects ${name} without partially applying prices`, async () => {
    const h = csvHarness(['symbol,price_ils,date', ...rows].join('\n'));
    await h.el('pricesFile').onchange();
    assert.match(h.el('priceStatus').textContent, /נתון לא תקין/);
    assert.equal(h.assets[0].price, 100);
    assert.equal(h.storage.size, 0);
  });
}

test('bond exposure excludes money-market holdings and uninvested cash', () => {
  const nodes = new Map();
  const context = vm.createContext({
    A: [{ id: 'GOV', kind: 'bond', price: 100 }, { id: 'CASH', kind: 'cash', price: 10 }],
    state: { cash: 12000, units: { GOV: 15, CASH: 150 }, trades: [
      { id: 'GOV', side: 'buy', qty: 15, sum: 1500 },
      { id: 'CASH', side: 'buy', qty: 150, sum: 1500 },
    ] },
    el: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); },
    money: String, portfolio: () => 15000,
    computeFifoComparison: () => ({ valid: true, realized: 0 }),
  });
  const start = html.indexOf('function performance()');
  vm.runInContext(html.slice(start, html.indexOf('function renderPaperRisk()', start)), context);
  context.performance();
  assert.equal(nodes.get('bondExposure').textContent, '+10.00%');
});
