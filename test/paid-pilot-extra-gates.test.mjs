import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPaidPilot,PILOT_POLICY} from '../agent/codex-paid-pilot-policy.mjs';
const approved={repository:PILOT_POLICY.repository,branch:PILOT_POLICY.branch,environment:'development',explicitPaidCallApproval:true,providerBillingVerified:true,providerUsageVerified:true,atomicReservationVerified:true,reconciliationVerified:true,hardSpendStopVerified:true,singleFlightVerified:true,productionAccess:false,liveTradingEnabled:false};
test('paid pilot fails closed if any mandatory safeguard is absent',()=>{
 for(const key of ['explicitPaidCallApproval','providerBillingVerified','providerUsageVerified','atomicReservationVerified','reconciliationVerified','hardSpendStopVerified','singleFlightVerified']){
  const result=assessPaidPilot({...approved,[key]:false});
  assert.equal(result.ready,false,key);
  assert.equal(result.apiCallsEnabled,false,key);
 }
});
test('even an approved plan cannot execute paid calls',()=>{
 const result=assessPaidPilot(approved);
 assert.equal(result.ready,true);
 assert.equal(result.apiCallsEnabled,false);
 assert.equal(result.reason,'manual_one_shot_execution_required');
 for(const patch of [{productionAccess:true},{liveTradingEnabled:true},{branch:'main'},{environment:'production'}]){
  assert.equal(assessPaidPilot({...approved,...patch}).ready,false);
 }
});
