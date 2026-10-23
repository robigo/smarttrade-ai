// Google OIDC authorization-code flow. No browser-accessible provider secrets.
const te=new TextEncoder();
const b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const rand=n=>b64u(crypto.getRandomValues(new Uint8Array(n)));
const cookie=(name,value,age)=>name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
async function mac(secret,message){const key=await crypto.subtle.importKey('raw',te.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(await crypto.subtle.sign('HMAC',key,te.encode(message)))}
async function seal(secret,obj){const data=b64u(te.encode(JSON.stringify(obj)));return data+'.'+await mac(secret,data)}
async function unseal(secret,value){if(!value||!value.includes('.'))return null;const [data,sig]=value.split('.');if(!data||!sig||await mac(secret,data)!==sig)return null;try{return JSON.parse(new TextDecoder().decode(from64(data)))}catch{return null}}
function getCookie(req,name){return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
function ready(env){return !!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_SESSION_SECRET?.length>=32&&env.GOOGLE_ALLOWED_EMAIL)}
const redirectUri='https://smarttrade-ai-preview.goshen-r.workers.dev/auth/google/callback';
const home='https://robigo.github.io/smarttrade-ai/';
async function verifyIdToken(jwt,clientId,nonce){
  const parts=jwt.split('.');if(parts.length!==3)throw Error('token');
  const header=JSON.parse(new TextDecoder().decode(from64(parts[0])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('algorithm');
  const keys=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw Error('jwks');return r.json()});
  const jwk=keys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');
  if(!jwk)throw Error('key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,from64(parts[2]),te.encode(parts[0]+'.'+parts[1])))throw Error('signature');
  const p=JSON.parse(new TextDecoder().decode(from64(parts[1])));
  const now=Math.floor(Date.now()/1000);
  if(!['https://accounts.google.com','accounts.google.com'].includes(p.iss)||p.aud!==clientId||p.nonce!==nonce||p.exp<=now||p.iat>now+60||!p.sub||p.email_verified!==true)throw Error('claims');
  return p;
}
export async function handleAuth(req,env,url){
  if(!ready(env))return json({error:'auth_not_configured'},503);
  if(req.method!=='GET')return json({error:'method_not_allowed'},405);
  const path=url.pathname;
  if(path==='/auth/google/start'){
    const state=rand(24),nonce=rand(24),verifier=rand(32);
    const challenge=b64u(await crypto.subtle.digest('SHA-256',te.encode(verifier)));
    const transaction=await seal(env.GOOGLE_SESSION_SECRET,{state,nonce,verifier,exp:Date.now()+300000});
    const google=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for(const [k,v] of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}))google.searchParams.set(k,v);
    return new Response(null,{status:302,headers:{location:google.toString(),'set-cookie':cookie('st_oauth',transaction,300),'cache-control':'no-store'}});
  }
  if(path==='/auth/google/callback'){
    const tx=await unseal(env.GOOGLE_SESSION_SECRET,getCookie(req,'st_oauth'));
    const headers=new Headers({'cache-control':'no-store','set-cookie':cookie('st_oauth','',0)});
    if(!tx||tx.exp<Date.now()||url.searchParams.get('state')!==tx.state||!url.searchParams.get('code'))return json({error:'invalid_oauth_state'},401,Object.fromEntries(headers));
    let stage='token_exchange';
    try{
      const body=new URLSearchParams({code:url.searchParams.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code',code_verifier:tx.verifier});
      const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000)});
      if(!r.ok){
        // Google's documented error code only; never log error_description, tokens or codes.
        let googleError='unknown';
        try { const payload=await r.json(); if(['invalid_client','invalid_grant','invalid_request','unauthorized_client','unsupported_grant_type'].includes(payload?.error)) googleError=payload.error; } catch {}
        console.warn('SMARTTRADE_GOOGLE_TOKEN_RESPONSE',{status:r.status,error:googleError});
        throw Error('exchange');
      }
      const tokens=await r.json();
      stage='id_token_verification';
      const p=await verifyIdToken(tokens.id_token,env.GOOGLE_CLIENT_ID,tx.nonce);
      if(p.email.toLowerCase()!==env.GOOGLE_ALLOWED_EMAIL.trim().toLowerCase())return json({error:'not_authorized'},403,Object.fromEntries(headers));
      stage='session_creation';
      const session=await seal(env.GOOGLE_SESSION_SECRET,{sub:p.sub,email:p.email,exp:Date.now()+3600000});
      headers.append('set-cookie',cookie('st_session',session,3600));
      headers.set('location',home);
      return new Response(null,{status:302,headers});
    }catch{console.warn('SMARTTRADE_GOOGLE_AUTH_STAGE',stage);return json({error:'google_auth_failed'},401,Object.fromEntries(headers))}
  }
  if(path==='/auth/logout')return new Response(null,{status:302,headers:{location:home,'set-cookie':cookie('st_session','',0),'cache-control':'no-store'}});
  if(path==='/auth/me'){
    const session=await unseal(env.GOOGLE_SESSION_SECRET,getCookie(req,'st_session'));
    if(!session||session.exp<Date.now())return json({authenticated:false},401);
    return json({authenticated:true,email:session.email});
  }
  return json({error:'not_found'},404);
}

// Shared server-side session validation for protected preview routes.
export async function getAuthorizedSession(req,env){
  if(!ready(env))return null;
  const session=await unseal(env.GOOGLE_SESSION_SECRET,getCookie(req,'st_session'));
  if(!session||typeof session.exp!=='number'||session.exp<=Date.now()||typeof session.sub!=='string'||!session.sub||typeof session.email!=='string')return null;
  if(session.email.toLowerCase()!==env.GOOGLE_ALLOWED_EMAIL.trim().toLowerCase())return null;
  return {sub:session.sub};
}
