import test from 'node:test';
import assert from 'node:assert/strict';
import {windowKeys} from '../cloudflare/src/quota-policy.mjs';
test('quota-invalid-time regression',()=>{
 for(const t of [-1,NaN,Infinity,1.1,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>windowKeys(t),RangeError);
});
