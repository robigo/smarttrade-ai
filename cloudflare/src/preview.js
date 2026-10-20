// Isolated UI-only preview. No OAuth or market-data secrets are required here.
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/health') return new Response(JSON.stringify({status:'ok',service:'smarttrade-ai-preview',mode:'ui-only'}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
    if(url.pathname.startsWith('/auth/')||url.pathname.startsWith('/api/')) return new Response(JSON.stringify({error:'preview_endpoint_disabled'}),{status:404,headers:{'content-type':'application/json','cache-control':'no-store'}});
    return env.ASSETS.fetch(request);
  }
};
