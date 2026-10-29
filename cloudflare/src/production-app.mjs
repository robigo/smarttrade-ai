// Separate website target. Never deploy over the existing private quote gateway.
import application from './preview.js';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export function productionConfiguration(env,requestOrigin){
 const missing=[];
 if(env.APP_ENVIRONMENT!=='production')missing.push('APP_ENVIRONMENT');
 let origin=null;
 try{
  const value=new URL(env.GOOGLE_APP_ORIGIN);
  if(value.protocol!=='https:'||value.username||value.password||value.pathname!=='/'||value.search||value.hash||
    ['https://smarttrade-ai-preview.goshen-r.workers.dev','https://smarttrade-ai.goshen-r.workers.dev'].includes(value.origin))throw Error('origin');
  origin=value.origin;
  if(requestOrigin!==origin)missing.push('REQUEST_ORIGIN');
 }catch{missing.push('GOOGLE_APP_ORIGIN');}
 for(const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_ALLOWED_EMAIL'])if(typeof env[key]!=='string'||!env[key].trim())missing.push(key);
 if(typeof env.GOOGLE_SESSION_SECRET!=='string'||env.GOOGLE_SESSION_SECRET.length<32)missing.push('GOOGLE_SESSION_SECRET');
 if(!env.PORTFOLIO_DB)missing.push('PORTFOLIO_DB');
 if(env.PORTFOLIO_SYNC_ENABLED!=='true')missing.push('PORTFOLIO_SYNC_ENABLED');
 if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')missing.push('ASSETS');
 return {ready:missing.length===0,missing,origin};
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),configuration=productionConfiguration(env,url.origin);
  if(url.pathname==='/health')return reply({status:'ok',service:'smarttrade-ai-app',mode:'paper-production',configurationReady:configuration.ready});
  if(url.pathname==='/ready')return reply({service:'smarttrade-ai-app',configurationReady:configuration.ready,missing:configuration.missing},configuration.ready?200:503);
  if(!configuration.ready)return reply({error:'production_not_configured'},503);
  // Market calls stay disabled even if a dashboard variable is set incorrectly.
  return application.fetch(request,{...env,MARKET_DISPLAY_APPROVED:'false',MARKET_QUOTA_GUARD_READY:'false'});
 }
};
