import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPaidPilot,PILOT_POLICY} from '../agent/codex-paid-pilot-policy.mjs';
const valid=()=>({
 repository:PILOT_POLICY.repository,branch:PILOT_POLICY.branch,
 environment:'development',explicitPaidCallApproval:true,
 providerBillingVerified:true,providerUsageVerified:true,
 atomicReservationVerified:true,reconciliationVerified:true,
 hardSpendStopVerified:true,singleFlightVerified:true,
 productionAccess:false,liveTradingEnabled:false
});
test('paid pilot is denied by default',()=>{
 assert.equal(assessPaidPilot().ready,false);
});
test('missing each independent spending safeguard fails closed',()=>{
 for(const key of ['explicitPaidCallApproval','providerBillingVerified','providerUsageVerified',
 'atomicReservationVerified','reconciliationVerified','hardSpendStopVerified','singleFlightVerified']){
  const result=assessPaidPilot({...valid(),[key]:false});
  assert.equal(result.ready,false,key);
  assert.equal(result.apiCallsEnabled,false,key);
 }
});
test('production and live trading are forbidden',()=>{
 assert.equal(assessPaidPilot({...valid(),productionAccess:true}).ready,false);
 assert.equal(assessPaidPilot({...valid(),liveTradingEnabled:true}).ready,false);
});
test('even approved pilot does not automatically invoke a paid API',()=>{
 const result=assessPaidPilot(valid());
 assert.equal(result.ready,true);
 assert.equal(result.apiCallsEnabled,false);
 assert.equal(result.maxOutputTokens,128);
});
