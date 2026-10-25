import {reserveCredit} from './quota-policy.mjs';

// Account-wide serialization via a single Durable Object instance.
// Requires a deployed DO binding and migration before live quotes are enabled.
export class MarketQuota {
  constructor(state){this.state=state;}
  async fetch(request){
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    const now=Date.now();
    return this.state.blockConcurrencyWhile(async()=>{
      const stored=await this.state.storage.get('basic8');
      // Missing storage is a fresh account. Corrupted storage must fail closed,
      // rather than silently resetting spent credits.
      if(stored!==undefined&&stored!==null&&(
        typeof stored!=='object'||Array.isArray(stored)||
        !Number.isSafeInteger(stored.minute)||stored.minute<0||
        !Number.isSafeInteger(stored.day)||stored.day<0||
        !Number.isSafeInteger(stored.minuteCount)||stored.minuteCount<0||
        !Number.isSafeInteger(stored.dayCount)||stored.dayCount<0
      ))throw new RangeError('invalid persisted quota');
      const result=reserveCredit(stored??{},now);
      if(result.allowed)await this.state.storage.put('basic8',result.counters);
      return new Response(JSON.stringify({allowed:result.allowed,reason:result.reason,retryAfterSeconds:result.retryAfterSeconds}),{
        status:result.allowed?200:429,
        headers:{'content-type':'application/json','cache-control':'no-store'}
      });
    });
  }
}
