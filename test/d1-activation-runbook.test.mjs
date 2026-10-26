import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('D1 rollout plan remains opt-in and cannot silently enable persistence',()=>{
 const doc=fs.readFileSync(new URL('../docs/d1-preview-activation-runbook.md',import.meta.url),'utf8');
 const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.preview.json',import.meta.url),'utf8'));
 assert.match(doc,/NOT ACTIVATED/);
 assert.match(doc,/legacy decimal-share, ILS/);
 assert.match(doc,/PORTFOLIO_SYNC_ENABLED/);
 assert.match(doc,/Rollback/);
 assert.equal(cfg.d1_databases,undefined);
 assert.equal(cfg.vars?.PORTFOLIO_SYNC_ENABLED,undefined);
});
