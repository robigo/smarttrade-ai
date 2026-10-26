export {MarketQuota} from './market-quota-do.mjs';
import {handleAuth,getAuthorizedSession} from './auth.js';
// Isolated same-origin authentication preview. Market data remains disabled until durable quota enforcement is deployed.
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/health') return new Response(JSON.stringify({status:'ok',service:'smarttrade-ai-preview',mode:'auth-preview',revision:env.RELEASE_SHA||null}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
    if(url.pathname.startsWith('/auth/')) return handleAuth(request,env,url);
    if(url.pathname==='/api/market/status'){
      if(request.method!=='GET')return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{'content-type':'application/json','cache-control':'no-store'}});
      const session=await getAuthorizedSession(request,env);
      if(!session)return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
      return new Response(JSON.stringify({authenticated:true,quotesEnabled:env.MARKET_DISPLAY_APPROVED==='true'&&Boolean(env.MARKET_QUOTA)&&env.MARKET_QUOTA_GUARD_READY==='true'&&Boolean(env.TWELVE_DATA_API_KEY),reason:env.MARKET_DISPLAY_APPROVED!=='true'?'display_disabled':env.MARKET_QUOTA_GUARD_READY!=='true'?'quota_guard_not_ready':env.TWELVE_DATA_API_KEY?'enabled':'provider_not_configured',symbols:['AAPL','MSFT','SPY']}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
    }
    if(url.pathname==='/api/market/quote'){
      const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
      if(request.method!=='GET')return json({error:'method_not_allowed'},405);
      if(!await getAuthorizedSession(request,env))return json({error:'unauthorized'},401);
      // Requires explicit operator enablement after confirming display rights.
      if(env.MARKET_DISPLAY_APPROVED!=='true')return json({error:'market_display_disabled'},403);
      // Fail closed: edge cache alone cannot enforce account-wide per-minute/daily limits.
      if(env.MARKET_QUOTA_GUARD_READY!=='true')return json({error:'quota_guard_not_ready'},503);
      if(!env.TWELVE_DATA_API_KEY)return json({error:'provider_not_configured'},503);
      if(!env.MARKET_QUOTA)return json({error:'quota_guard_unavailable'},503);
      // Validate symbols before any cache access; unsupported requests must never
      // reach cached provider data or consume provider credits.
      const symbol=url.searchParams.get('symbol');
      if(!['AAPL','MSFT','SPY'].includes(symbol))return json({error:'unsupported_symbol'},400);
      // Edge cache is only an optimization, not a distributed quota guard.
      const cache=caches.default;
      const cachedKey=new Request('https://smarttrade-preview-cache.invalid/quote/'+encodeURIComponent(symbol));
      const cached=await cache.match(cachedKey);
      if(cached)return cached;
      try{
        // Reserve before calling provider; conservative counting includes failed upstream calls.
        const quotaObject=env.MARKET_QUOTA.get(env.MARKET_QUOTA.idFromName('twelvedata-basic8-preview'));
        const quotaResponse=await quotaObject.fetch('https://quota.internal/reserve',{method:'POST'});
        if(quotaResponse.status===429)return json({error:'provider_quota_exceeded'},429);
        if(!quotaResponse.ok)return json({error:'quota_guard_unavailable'},503);
        const upstreamUrl=new URL('https://api.twelvedata.com/quote');
        upstreamUrl.searchParams.set('symbol',symbol);
        upstreamUrl.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
        const upstream=await fetch(upstreamUrl,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
        if(!upstream.ok)return json({error:'provider_unavailable'},502);
        const data=await upstream.json();
        const price=Number(data.close);
        if(data.status==='error'||!Number.isFinite(price)||price<=0)return json({error:'invalid_provider_response'},502);
        const payload={symbol,price,currency:'USD',source:'Twelve Data',providerTime:data.datetime||null,receivedAt:new Date().toISOString(),note:'Provider quote may be delayed or non-consolidated'};
        const response=json(payload);
        // Do not activate automatic provider polling. Short-lived edge cache only.
        const cacheable=new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','cache-control':'public, max-age=60'}});
        await cache.put(cachedKey,cacheable);
        return response;
      }catch{return json({error:'provider_unavailable'},502)}
    }
    if(url.pathname.startsWith('/api/')) return new Response(JSON.stringify({error:'preview_endpoint_disabled'}),{status:404,headers:{'content-type':'application/json','cache-control':'no-store'}});
    return env.ASSETS.fetch(request);
  }
};
