import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

test('pre-production report is explicit and cannot silently approve production',{skip:!existsSync('production-readiness-report.json')?'report generated in readiness job':false},()=>{
  const r=JSON.parse(readFileSync('production-readiness-report.json','utf8'));
  assert.equal(r.productionReady,false,'Never mark production ready while blockers remain');
  assert.ok(Array.isArray(r.checks)&&r.checks.length>=5,'Missing check evidence');
  assert.ok(Array.isArray(r.blockers)&&r.blockers.length>=1,'Missing blockers');
  assert.ok(r.blockers.some(b=>/approval/i.test(b)),'Human approval blocker missing');
  assert.ok(r.blockers.some(b=>/security|csrf|cookie/i.test(b)),'Security evidence blocker missing');
  assert.ok(Number.isFinite(Date.parse(r.generatedAt)),'Report timestamp missing');
});
