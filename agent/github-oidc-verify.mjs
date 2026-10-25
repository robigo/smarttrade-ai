// Verify GitHub Actions OIDC JWT cryptographically before checking repository claims.
// No secrets, deployment or Codex API calls. The expected audience is supplied by
// the future budget gateway configuration, never read from the untrusted token.
import {authorizeGitHubRunner} from './github-oidc-policy.mjs';

const ISSUER='https://token.actions.githubusercontent.com';
const JWKS_URL=ISSUER+'/.well-known/jwks';
const decoder=new TextDecoder();
const encoder=new TextEncoder();
function decodePart(part){
  if(!/^[A-Za-z0-9_-]+$/.test(part))throw Error('malformed_token');
  const binary=atob(part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
export async function verifyGitHubOidc(token,{audience,fetchJwks=fetch,nowSeconds=Math.floor(Date.now()/1000)}={}){
  const deny=reason=>({allowed:false,reason});
  if(typeof audience!=='string'||audience.length<12||typeof token!=='string'||token.length>16384)
    return deny('invalid_input');
  const parts=token.split('.');
  if(parts.length!==3)return deny('malformed_token');
  try{
    const header=JSON.parse(decoder.decode(decodePart(parts[0])));
    const claims=JSON.parse(decoder.decode(decodePart(parts[1])));
    if(!header||header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string'||!header.kid)
      return deny('unsupported_header');
    if(!claims||claims.iss!==ISSUER||claims.aud!==audience||
       !Number.isSafeInteger(claims.exp)||!Number.isSafeInteger(claims.iat)||
       claims.exp<=nowSeconds||claims.iat>nowSeconds+60||
       claims.exp-claims.iat>600||
       (claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>nowSeconds+60)))
      return deny('invalid_token_claims');
    const response=await fetchJwks(JWKS_URL,{signal:AbortSignal.timeout(8000)});
    if(!response.ok)return deny('jwks_unavailable');
    const document=await response.json();
    if(!Array.isArray(document?.keys))return deny('invalid_jwks');
    const jwk=document.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&k.alg==='RS256');
    if(!jwk)return deny('unknown_key');
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodePart(parts[2]),encoder.encode(parts[0]+'.'+parts[1]));
    if(!valid)return deny('invalid_signature');
    return authorizeGitHubRunner(claims);
  }catch{return deny('verification_failed');}
}
