import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('preview shows portfolio risk without enabling real quotes',()=>{
 const html=fs.readFileSync(new URL('../preview-public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="riskSummary"/);
 assert.match(html,/function renderPaperRisk\(/);
 assert.match(html,/function render\(\)\{renderPaperRisk\(\)/);
 assert.match(html,/מחירי הסימולציה בלבד/);
});
