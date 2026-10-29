import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import fs from 'node:fs';
import worker,{productionConfiguration} from '../cloudflare/src/production-app.mjs';
import {buildProductionAppConfig} from '../scripts/production-app-config.mjs';
const origin='https://smarttrade-ai-app.goshen-r.workers.dev';
const settings=()=>({APP_ENVIRONMENT:'production',GOOGLE_APP_ORIGIN:origin,GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_SESSION_SECRET:'s'.repeat(48),GOOGLE_ALLOWED_EMAIL:'owner@example.invalid',PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:{prepare(){throw Error('Unexpected database access');}},ASSETS:{fetch:async()=>new Response('<title>SmartTrade AI</title>',{headers:{'content-type':'text/html'}})}});
const request=path=>new Request(origin+path);
test('production readiness fails closed before credentials and storage exist',async()=>{
 const result=await worker.fetch(request('/ready'),{});assert.equal(result.status,503);
 const data=await result.json();assert.equal(data.configurationReady,false);assert.ok(data.missing.includes('PORTFOLIO_DB'));
 assert.equal((await worker.fetch(request('/'),{})).status,503);
 assert.equal((await worker.fetch(request('/auth/google/start'),{})).status,503);
});
test('liveness distinguishes production from Preview without claiming a release is approved',async()=>{
 const result=await worker.fetch(request('/health'),{});
 assert.deepEqual(await result.json(),{status:'ok',service:'smarttrade-ai-app',mode:'paper-production',configurationReady:false});
});
test('configured production serves the same app and exposes separate readiness',async()=>{
 const env=settings();const response=await worker.fetch(request('/'),env);
 assert.equal(response.status,200);assert.match(await response.text(),/SmartTrade AI/);
 assert.equal((await worker.fetch(request('/ready'),env)).status,200);
});
test('missing flags, invalid origins, Preview and gateway origins cannot pass production readiness',()=>{
 for(const change of [{APP_ENVIRONMENT:'preview'},{PORTFOLIO_SYNC_ENABLED:'false'},{GOOGLE_SESSION_SECRET:'short'},{GOOGLE_APP_ORIGIN:'http://insecure.invalid'},{GOOGLE_APP_ORIGIN:'https://smarttrade-ai-preview.goshen-r.workers.dev'},{GOOGLE_APP_ORIGIN:'https://smarttrade-ai.goshen-r.workers.dev'}])assert.equal(productionConfiguration({...settings(),...change},origin).ready,false);
 assert.equal(productionConfiguration(settings(),'https://different.invalid').ready,false);
});
test('production OAuth start targets its own callback without calling Google',async()=>{
 const response=await worker.fetch(request('/auth/google/start'),settings());
 assert.equal(response.status,302);
 const target=new URL(response.headers.get('location'));
 assert.equal(target.origin,'https://accounts.google.com');
 assert.equal(target.searchParams.get('redirect_uri'),origin+'/auth/google/callback');
});
test('production rejects anonymous account access before touching its database',async()=>{
 const response=await worker.fetch(request('/api/private/portfolio'),settings());
 assert.equal(response.status,401);assert.equal((await response.json()).error,'unauthorized');
});
test('an authorized production session cannot enable the paid provider through dashboard flags',async()=>{
 const env={...settings(),MARKET_DISPLAY_APPROVED:'true',MARKET_QUOTA_GUARD_READY:'true'};
 const data=Buffer.from(JSON.stringify({sub:'synthetic-owner',email:env.GOOGLE_ALLOWED_EMAIL,exp:Date.now()+3600000})).toString('base64url');
 const signature=createHmac('sha256',env.GOOGLE_SESSION_SECRET).update(data).digest('base64url');
 const response=await worker.fetch(new Request(origin+'/api/market/quote?symbol=AAPL',{headers:{cookie:'st_session='+data+'.'+signature}}),env);
 assert.equal(response.status,403);assert.equal((await response.json()).error,'market_display_disabled');
 assert.equal((await worker.fetch(request('/api/quote'),env)).status,404);
});
test('production config requires its own database and cannot overwrite the gateway',()=>{
 const base=JSON.parse(fs.readFileSync(new URL('../wrangler.production-app.json',import.meta.url),'utf8'));
 const previewId='11111111-2222-4333-8444-555555555555',productionId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 const policy={database_id_sha256:createHash('sha256').update(previewId).digest('hex')};
 assert.throws(()=>buildProductionAppConfig(base,{id:previewId,name:'smarttrade-ai-production-accounts-test',enabled:'true'},policy),/Preview database/);
 assert.throws(()=>buildProductionAppConfig({...base,name:'smarttrade-ai'},{id:productionId,name:'smarttrade-ai-production-accounts-test',enabled:'true'},policy),/target/);
 const result=buildProductionAppConfig(base,{id:productionId,name:'smarttrade-ai-production-accounts-test',enabled:'false'},policy);
 assert.equal(result.d1_databases[0].database_id,productionId);assert.equal(result.vars.PORTFOLIO_SYNC_ENABLED,'false');
 assert.equal(result.vars.MARKET_DISPLAY_APPROVED,'false');assert.equal(base.d1_databases,undefined);
});
