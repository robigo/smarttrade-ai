// Production candidate only: no deployment is authorized by this module.
// Share Preview's tested auth/market guards rather than the legacy bearer API.
import application from './preview.js';
import {authOrigin} from './auth.js';
export {MarketQuota} from './market-quota-do.mjs';
const json=(body,status)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      return json({status:'ok',service:'smarttrade-ai',mode:'auth-production',revision:env.RELEASE_SHA||null},200);
    }
    // No implicit Preview fallback, even if this entrypoint is misconfigured.
    if(typeof env.AUTH_PUBLIC_ORIGIN!=='string'||env.AUTH_PUBLIC_ORIGIN==='https://smarttrade-ai-preview.goshen-r.workers.dev'||!authOrigin(env,url.origin)){
      return json({error:'production_origin_not_configured'},503);
    }
    return application.fetch(request,env);
  }
};
