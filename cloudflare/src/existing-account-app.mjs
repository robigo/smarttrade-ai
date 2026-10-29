// Optional website/account routes on the existing gateway. Disabled by default.
import {getAuthorizedSession} from './auth.js';
import {handlePrivatePortfolio} from './private-portfolio.mjs';
import {personalMarketStatus,fetchPersonalQuote} from './personal-market.mjs';
const paths=new Set(['/','/index.html','/account-client.js','/personal-market-client.js','/api/private/portfolio','/api/market/status','/api/market/quote','/_account/ready']);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleExistingAccountApp(request,env,url){
 if(env.ACCOUNT_APP_ENABLED!=='true'||!paths.has(url.pathname))return null;
 let validOrigin=false;
 try{const value=new URL(env.GOOGLE_APP_ORIGIN);validOrigin=value.protocol==='https:'&&!value.username&&!value.password&&value.pathname==='/'&&!value.search&&!value.hash&&value.origin===url.origin;}catch{}
 const authConfigured=env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_ALLOWED_EMAIL&&typeof env.GOOGLE_SESSION_SECRET==='string'&&env.GOOGLE_SESSION_SECRET.length>=32;
 if(!validOrigin||!authConfigured||env.PORTFOLIO_SYNC_ENABLED!=='true'||!env.PORTFOLIO_DB||typeof env.ASSETS?.fetch!=='function')return json({error:'account_app_not_configured'},503);
 if(url.pathname==='/_account/ready')return json({ready:true,quotesEnabled:personalMarketStatus(env).quotesEnabled});
 if(url.pathname==='/api/private/portfolio')return handlePrivatePortfolio(request,env,url);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(url.pathname.startsWith('/api/market/')){
  if(!await getAuthorizedSession(request,env))return json({error:'unauthorized'},401);
  const status=personalMarketStatus(env);
  if(url.pathname==='/api/market/status')return json(status);
  if(env.MARKET_LEARNING_ENABLED!=='true')return json({error:'market_display_disabled'},403);
  return fetchPersonalQuote(url.searchParams.get('symbol'),env);
 }
 return env.ASSETS.fetch(request);
}
