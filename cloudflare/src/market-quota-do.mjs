import {reserveCredit} from './quota-policy.mjs';

// Account-wide serialization via a single Durable Object instance.
// Requires a deployed DO binding and migration before live quotes are enabled.
export class MarketQuota {
  constructor(state){this.state=state;}
  async fetch(request){
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    const now=Date.now();
    return this.state.blockConcurrencyWhile(async()=>{
      const previous=await this.state.storage.get('basic8')||{};
      const result=reserveCredit(previous,now);
      if(result.allowed)await this.state.storage.put('basic8',result.counters);
      return new Response(JSON.stringify({allowed:result.allowed,reason:result.reason,retryAfterSeconds:result.retryAfterSeconds}),{
        status:result.allowed?200:429,
        headers:{'content-type':'application/json','cache-control':'no-store'}
      });
    });
  }
}
