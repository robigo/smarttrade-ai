import { handleAuth } from "./auth.js";
// SmartTrade AI private quote gateway - not connected to public GitHub Pages.
// Never place secrets in this source file or expose restricted quotes publicly.
const allowed = new Set(["AAPL", "MSFT", "SPY"]);
const encoder = new TextEncoder();
const response = (data, status=200) => new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
function equalTokens(a,b) {
  const aa=encoder.encode(a),bb=encoder.encode(b);
  if(aa.length!==bb.length) return false;
  let diff=0;
  for(let i=0;i<aa.length;i++) diff |= aa[i]^bb[i];
  return diff===0;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/auth/")) return handleAuth(request, env, url);
    if (url.pathname === "/health" && request.method === "GET") return response({status:"ok",service:"smarttrade-private-gateway",quotes:"restricted"});
    if (url.pathname !== "/api/quote") return response({error:"not_found"},404);
    if (request.method !== "GET") return response({error:"method_not_allowed"},405);
    const header=request.headers.get("authorization")||"";
    if (!env.SMARTTRADE_ACCESS_TOKEN || env.SMARTTRADE_ACCESS_TOKEN.length < 32 || !header.startsWith("Bearer ") || !equalTokens(header.slice(7), env.SMARTTRADE_ACCESS_TOKEN)) return response({error:"unauthorized"},401);
    if (!env.TWELVE_DATA_API_KEY) return response({error:"server_not_configured"},503);
    const symbol=url.searchParams.get("symbol");
    if (!allowed.has(symbol)) return response({error:"unsupported_symbol"},400);
    try {
      const endpoint=new URL("https://api.twelvedata.com/quote");
      endpoint.searchParams.set("symbol",symbol);
      endpoint.searchParams.set("apikey",env.TWELVE_DATA_API_KEY);
      const upstream=await fetch(endpoint.toString(),{headers:{accept:"application/json"},signal:AbortSignal.timeout(10000)});
      if (!upstream.ok) return response({error:"upstream_unavailable"},502);
      const quote=await upstream.json();
      const price=Number(quote.close);
      if (quote.status==="error" || !Number.isFinite(price) || price<=0) return response({error:"invalid_quote"},502);
      return response({symbol,price,currency:"USD",source:"Twelve Data",providerTime:quote.datetime||null,receivedAt:new Date().toISOString(),note:"Provider-specific quote; may be delayed or non-consolidated"});
    } catch {
      return response({error:"upstream_unavailable"},502);
    }
  }
};
