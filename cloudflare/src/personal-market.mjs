// Private, manually requested Basic quotes for the owner's learning tool.
export const PERSONAL_SYMBOLS=Object.freeze(['AAPL','MSFT','SPY']);
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
export function personalMarketStatus(env){
 const reason=env.MARKET_LEARNING_ENABLED!=='true'?'display_disabled':!env.TWELVE_DATA_API_KEY?'provider_not_configured':env.MARKET_QUOTA_GUARD_READY!=='true'||!env.MARKET_QUOTA?'quota_guard_not_ready':'personal_learning';
 return {authenticated:true,quotesEnabled:reason==='personal_learning',reason,mode:'personal-learning',symbols:PERSONAL_SYMBOLS,limits:{perMinute:8,perDay:800},automaticPolling:false};
}
export async function fetchPersonalQuote(symbol,env){
 if(!PERSONAL_SYMBOLS.includes(symbol))return json({error:'unsupported_symbol'},400);
 if(!env.TWELVE_DATA_API_KEY)return json({error:'provider_not_configured'},503);
 if(env.MARKET_QUOTA_GUARD_READY!=='true'||!env.MARKET_QUOTA)return json({error:'quota_guard_unavailable'},503);
 let reserved;
 try{
  // One persistent counter is shared by the Google and legacy bearer endpoints.
  const quota=env.MARKET_QUOTA.get(env.MARKET_QUOTA.idFromName('twelvedata-basic8-personal'));
  reserved=await quota.fetch('https://quota.internal/reserve',{method:'POST'});
 }catch{return json({error:'quota_guard_unavailable'},503)}
 try{
  if(reserved.status===429){
   let retry=60;try{const data=await reserved.json();if(Number.isSafeInteger(data.retryAfterSeconds)&&data.retryAfterSeconds>0)retry=data.retryAfterSeconds;}catch{}
   return json({error:'provider_quota_exceeded',retryAfterSeconds:retry},429,{'retry-after':String(retry)});
  }
  if(!reserved.ok)return json({error:'quota_guard_unavailable'},503);
  const url=new URL('https://api.twelvedata.com/quote');url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
  const response=await fetch(url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
  let data;try{data=await response.json()}catch{return json({error:'invalid_provider_response'},502)}
  if(response.status===429||data.code===429)return json({error:'provider_quota_exceeded'},429);
  if([401,403].includes(response.status)||[401,403].includes(data.code))return json({error:'provider_access_denied'},403);
  if(!response.ok||data.status==='error')return json({error:'provider_unavailable'},502);
  const price=Number(data.close);
  if(data.symbol!==symbol||data.currency!=='USD'||!['string','number'].includes(typeof data.close)||!Number.isFinite(price)||price<=0)return json({error:'invalid_provider_response'},502);
  return json({symbol,price,currency:'USD',source:'Twelve Data',providerTime:typeof data.datetime==='string'?data.datetime:null,receivedAt:new Date().toISOString(),mode:'personal-learning',note:'Personal learning quote; timing and coverage depend on the provider. Does not update the simulation portfolio.'});
 }catch{return json({error:'provider_unavailable'},502)}
}
