import {handleAuth,getAuthorizedSession} from './auth.js';
// Isolated same-origin authentication preview. Private market-data API stays disabled.
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/health') return new Response(JSON.stringify({status:'ok',service:'smarttrade-ai-preview',mode:'auth-preview'}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
    if(url.pathname.startsWith('/auth/')) return handleAuth(request,env,url);
    if(url.pathname==='/api/market/status'){
      if(request.method!=='GET')return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{'content-type':'application/json','cache-control':'no-store'}});
      const session=await getAuthorizedSession(request,env);
      if(!session)return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
      return new Response(JSON.stringify({authenticated:true,quotesEnabled:false,reason:'provider_display_license_not_verified',symbols:['AAPL','MSFT','SPY']}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
    }
    if(url.pathname.startsWith('/api/')) return new Response(JSON.stringify({error:'preview_endpoint_disabled'}),{status:404,headers:{'content-type':'application/json','cache-control':'no-store'}});
    return env.ASSETS.fetch(request);
  }
};
