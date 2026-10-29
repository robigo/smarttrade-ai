// Account-scoped, opt-in D1 portfolio storage. Binding and feature flag are
// intentionally absent from Preview config until migrations and UAT are approved.
import {getAuthorizedSession} from './auth.js';
import {initialPortfolio} from '../../app/portfolio-engine.mjs';
import {validatePortfolioLedger} from '../../app/portfolio-ledger-integrity.mjs';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const MAX_BYTES=131072;
export async function handlePrivatePortfolio(request,env,url){
 if(!['GET','PUT'].includes(request.method))return reply({error:'method_not_allowed'},405);
 const session=await getAuthorizedSession(request,env);
 if(!session)return reply({error:'unauthorized'},401);
 if(env.PORTFOLIO_SYNC_ENABLED!=='true'||!env.PORTFOLIO_DB)return reply({error:'sync_not_enabled'},503);
 const owner=session.sub;
 if(request.method==='GET'){
  try{
   const row=await env.PORTFOLIO_DB.prepare('SELECT version, snapshot_json FROM paper_portfolios WHERE owner_sub = ?').bind(owner).first();
   if(!row)return reply({accountId:owner,version:0,snapshot:initialPortfolio()});
   const snapshot=JSON.parse(row.snapshot_json);
   if(!validatePortfolioLedger(snapshot).valid)return reply({error:'stored_portfolio_invalid'},503);
   return reply({accountId:owner,version:row.version,snapshot});
  }catch{return reply({error:'storage_unavailable'},503)}
 }
 // Session cookies are sent automatically. Require an explicit same-origin
 // browser request to prevent cross-site writes; do not allow CORS.
 if(request.headers.get('Origin')!==url.origin)return reply({error:'invalid_origin'},403);
 // Bind this draft to the account that loaded it. A changed session cookie
 // must never save the previous account's draft into another user's account.
 if(request.headers.get('X-Account-Id')!==owner)return reply({error:'account_changed'},403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return reply({error:'unsupported_media_type'},415);
 const length=Number(request.headers.get('content-length')||0);
 if(length>MAX_BYTES)return reply({error:'payload_too_large'},413);
 let raw;
 try{raw=await request.text()}catch{return reply({error:'invalid_body'},400)}
 if(new TextEncoder().encode(raw).length>MAX_BYTES)return reply({error:'payload_too_large'},413);
 let body;
 try{body=JSON.parse(raw)}catch{return reply({error:'invalid_json'},400)}
 if(!body||!Number.isSafeInteger(body.version)||body.version<0||!validatePortfolioLedger(body.snapshot).valid)return reply({error:'invalid_portfolio'},400);
 const json=JSON.stringify(body.snapshot);
 try{
  if(body.version===0){
   const insert=await env.PORTFOLIO_DB.prepare('INSERT INTO paper_portfolios (owner_sub,version,snapshot_json) VALUES (?,1,?) ON CONFLICT(owner_sub) DO NOTHING').bind(owner,json).run();
   if(insert.meta?.changes===1)return reply({version:1});
  }else{
   const update=await env.PORTFOLIO_DB.prepare('UPDATE paper_portfolios SET snapshot_json=?, version=version+1 WHERE owner_sub=? AND version=?').bind(json,owner,body.version).run();
   if(update.meta?.changes===1)return reply({version:body.version+1});
  }
  return reply({error:'version_conflict'},409);
 }catch{return reply({error:'storage_unavailable'},503)}
}
