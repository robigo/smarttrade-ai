/**
 * SmartTrade AI private quote gateway (Node 20+).
 * Run behind HTTPS and authentication; never expose secrets in GitHub Pages.
 * Not a production deployment. Verify quote display rights before use.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const ACCESS_TOKEN = process.env.SMARTTRADE_ACCESS_TOKEN;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const SYMBOLS = Object.freeze({AAPL:'AAPL',MSFT:'MSFT',SPY:'SPY'});
if (!API_KEY || !ACCESS_TOKEN || ACCESS_TOKEN.length < 32) {
  console.error('Missing TWELVE_DATA_API_KEY or a 32+ character SMARTTRADE_ACCESS_TOKEN');
  process.exit(1);
}
let lastRequest = 0;
const cache = new Map();
function authorized(header) {
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token), b = Buffer.from(ACCESS_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}
function reply(res,code,obj) {
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(obj));
}
http.createServer(async (req,res)=>{
  if(req.method !== 'GET') return reply(res,405,{error:'method_not_allowed'});
  if(!authorized(req.headers.authorization)) return reply(res,401,{error:'unauthorized'});
  let url;
  try {url = new URL(req.url,'http://localhost');} catch {return reply(res,400,{error:'invalid_url'});}
  if(url.pathname !== '/api/quote') return reply(res,404,{error:'not_found'});
  const symbol = url.searchParams.get('symbol');
  if(!Object.hasOwn(SYMBOLS,symbol)) return reply(res,400,{error:'unsupported_symbol'});
  const now=Date.now(), item=cache.get(symbol);
  if(item && now-item.fetchedAt<900000) return reply(res,200,{...item.data,cache:true});
  if(now-lastRequest<8000) return reply(res,429,{error:'rate_limited',retryAfterSeconds:8});
  lastRequest=now;
  try {
    const upstream=new URL('https://api.twelvedata.com/quote');
    upstream.searchParams.set('symbol',SYMBOLS[symbol]);
    upstream.searchParams.set('apikey',API_KEY);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    let response;
    try {response=await fetch(upstream,{signal:controller.signal,headers:{'Accept':'application/json'}});}
    finally {clearTimeout(timer);}
    if(!response.ok) return reply(res,502,{error:'upstream_unavailable'});
    const data=await response.json();
    const price=Number(data.close);
    if(data.status==='error'||!Number.isFinite(price)||price<=0) return reply(res,502,{error:'invalid_quote'});
    const timestamp=Date.parse(data.datetime || '');
    const result={symbol,price,currency:'USD',source:'Twelve Data',asOf:Number.isFinite(timestamp)?new Date(timestamp).toISOString():null,receivedAt:new Date().toISOString(),venueCoverage:'provider-specific; not guaranteed consolidated'};
    cache.set(symbol,{fetchedAt:Date.now(),data:result});
    reply(res,200,{...result,cache:false});
  } catch {reply(res,502,{error:'upstream_unavailable'});}
}).listen(PORT,HOST,()=>console.log('Private quote gateway listening on '+HOST+':'+PORT));
