import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifyGitHubOidc} from '../agent/github-oidc-verify.mjs';

const crypt=globalThis.crypto||webcrypto;
const audience='smarttrade-codex-budget';
const now=1800000000;
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const claims=()=>({
 iss:'https://token.actions.githubusercontent.com',aud:audience,
 exp:now+300,iat:now-10,nbf:now-10,
 repository:'robigo/smarttrade-ai',repository_id:'1425895646',
 ref:'refs/heads/preview/cloudflare-unified-v09',ref_type:'branch',
 event_name:'push',workflow:'SmartTrade Preview Deploy',
 run_id:'1234567',sha:'a'.repeat(40)
});
async function fixture(){
 const pair=await crypt.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const publicJwk={...await crypt.subtle.exportKey('jwk',pair.publicKey),kid:'test-key',use:'sig',alg:'RS256'};
 const fetchJwks=async url=>{
  assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');
  return {ok:true,json:async()=>({keys:[publicJwk]})};
 };
 async function sign(payload=claims()){
  const header=encode({alg:'RS256',typ:'JWT',kid:'test-key'});
  const body=encode(payload);
  const input=header+'.'+body;
  const sig=await crypt.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input));
  return input+'.'+Buffer.from(sig).toString('base64url');
 }
 return {sign,fetchJwks};
}
test('valid signed and scoped token authorizes read-only runner',async()=>{
 const f=await fixture();
 assert.deepEqual(await verifyGitHubOidc(await f.sign(),{audience,fetchJwks:f.fetchJwks,nowSeconds:now}),{allowed:true,mode:'read_only'});
});
test('tampering, expired tokens, wrong audience and branch fail closed',async()=>{
 const f=await fixture();
 for(const patch of [{exp:now-1},{aud:'wrong'},{ref:'refs/heads/main'},{iss:'https://evil.invalid'},{nbf:now+120}]){
  const result=await verifyGitHubOidc(await f.sign({...claims(),...patch}),{audience,fetchJwks:f.fetchJwks,nowSeconds:now});
  assert.equal(result.allowed,false);
 }
 const valid=await f.sign();
 const parts=valid.split('.');
 const tampered=parts[0]+'.'+encode({...claims(),repository:'evil/repo'})+'.'+parts[2];
 assert.equal((await verifyGitHubOidc(tampered,{audience,fetchJwks:f.fetchJwks,nowSeconds:now})).allowed,false);
});
test('missing keys, malformed tokens and unavailable JWKS fail closed',async()=>{
 const f=await fixture();
 const token=await f.sign();
 assert.equal((await verifyGitHubOidc('invalid',{audience,fetchJwks:f.fetchJwks,nowSeconds:now})).allowed,false);
 assert.equal((await verifyGitHubOidc(token,{audience,fetchJwks:async()=>({ok:false}),nowSeconds:now})).allowed,false);
 assert.equal((await verifyGitHubOidc(token,{audience,fetchJwks:async()=>({ok:true,json:async()=>({keys:[]})}),nowSeconds:now})).allowed,false);
});
