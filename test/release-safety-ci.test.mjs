import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import preview from '../cloudflare/src/preview.js';

test('market monitor cannot make scheduled or direct provider calls',()=>{
 const workflow=fs.readFileSync('.github/workflows/check-twelve-data.yml','utf8');
 assert.doesNotMatch(workflow,/schedule:|cron:|secrets\.|TWELVE_DATA_API_KEY|api\.twelvedata\.com/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/assert\.equal\(response\.status,401\)/);
});
test('Preview reports the release SHA without changing its environment identity',async()=>{
 const sha='a'.repeat(40);
 const response=await preview.fetch(new Request('https://preview.invalid/health'),{RELEASE_SHA:sha});
 const health=await response.json();
 assert.equal(health.service,'smarttrade-ai-preview');assert.equal(health.revision,sha);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('post-deploy browser gate waits for deployment and checks matching SHA',()=>{
 const workflow=fs.readFileSync('.github/workflows/preview-deploy.yml','utf8');
 assert.match(workflow,/--var RELEASE_SHA:"\$GITHUB_SHA"/);
 assert.match(workflow,/post_deploy_browser_smoke:\s+needs: post_deploy_auth_guard/);
 assert.match(workflow,/needs: \[verify, deploy, post_deploy_auth_guard, post_deploy_browser_smoke\]/);
 const browser=fs.readFileSync('test/preview-ui-smoke.mjs','utf8');
 assert.match(browser,/health\.revision,process\.env\.EXPECTED_SHA/);
 assert.equal((browser.match(/await verifyRevision\(\);/g)||[]).length,2);
});
