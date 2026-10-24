import test from 'node:test';
import assert from 'node:assert/strict';
import {decideNextStep} from '../scripts/ci-result-controller.mjs';
const base={name:'SmartTrade Preview Deploy',branch:'preview/cloudflare-unified-v09'};
test('success advances to health',()=>assert.equal(decideNextStep({...base,conclusion:'success'}).step,'health'));
test('failure stops',()=>assert.equal(decideNextStep({...base,conclusion:'failure'}).step,'stop'));
test('cancelled stops',()=>assert.equal(decideNextStep({...base,conclusion:'cancelled'}).step,'stop'));
test('production is ignored',()=>assert.equal(decideNextStep({...base,branch:'main',conclusion:'success'}).step,'ignore'));
test('unrelated workflow ignored',()=>assert.equal(decideNextStep({...base,name:'other',conclusion:'success'}).step,'ignore'));
