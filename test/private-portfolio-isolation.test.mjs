import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../cloudflare/src/private-portfolio.mjs',import.meta.url),'utf8');
const script=source.replace(/^import .*;\r?\n/gm,'').replace('export async function handlePrivatePortfolio','async function handlePrivatePortfolio')+'\nthis.handlePrivatePortfolio=handlePrivatePortfolio;';
let owner='owner-A';
const initialPortfolio=()=>({cashCents:1500000,positions:{},trades:[]});
const ctx={Response,TextEncoder,JSON,Number,URL,initialPortfolio,
 getAuthorizedSession:async()=>({sub:owner}),
 validatePortfolioLedger:p=>({valid:p?.cashCents===1500000&&Object.keys(p.positions||{}).length===0&&Array.isArray(p.trades)&&p.trades.length===0})};
vm.runInNewContext(script,ctx);
const handler=ctx.handlePrivatePortfolio;
const url=new URL('https://preview.invalid/api/private/portfolio');
function mockDb(){
 const records=new Map();
 function prepare(sql){
  return {
   args:[],
   bind(...args){this.args=args;return this;},
   async first(){return records.get(this.args[0])||null;},
   async run(){
    if(sql.startsWith('INSERT')){
     const [id,json]=this.args;
     if(records.has(id))return {meta:{changes:0}};
     records.set(id,{version:1,snapshot_json:json});
     return {meta:{changes:1}};
    }
    const [json,id,version]=this.args;
    const row=records.get(id);
    if(!row||row.version!==version)return {meta:{changes:0}};
    records.set(id,{version:version+1,snapshot_json:json});
    return {meta:{changes:1}};
   }
  };
 }
 return {records,prepare};
}
const request=(method,body)=>new Request(url,{method,headers:method==='PUT'?{'origin':url.origin,'content-type':'application/json','X-Account-Id':owner}:undefined,body:method==='PUT'?JSON.stringify(body):undefined});
test('private portfolios are isolated by Google subject',async()=>{
 const database=mockDb(),env={PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:database};
 owner='owner-A';
 let r=await handler(request('PUT',{version:0,snapshot:initialPortfolio()}),env,url);
 assert.equal(r.status,200);
 owner='owner-B';
 r=await handler(request('GET'),env,url);
 assert.equal((await r.json()).version,0);
 r=await handler(request('PUT',{version:0,snapshot:initialPortfolio()}),env,url);
 assert.equal(r.status,200);
 assert.equal(database.records.size,2);
 owner='owner-A';
 assert.equal((await (await handler(request('GET'),env,url)).json()).version,1);
});
test('stale updates cannot overwrite a newer version',async()=>{
 const database=mockDb(),env={PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:database};
 owner='owner-A';
 await handler(request('PUT',{version:0,snapshot:initialPortfolio()}),env,url);
 const good=await handler(request('PUT',{version:1,snapshot:initialPortfolio()}),env,url);
 assert.equal(good.status,200);
 const stale=await handler(request('PUT',{version:1,snapshot:initialPortfolio()}),env,url);
 assert.equal(stale.status,409);
 assert.equal(database.records.get(owner).version,2);
});

test('a draft loaded by another account is rejected before any storage writes',async()=>{
 const database=mockDb(),env={PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:database};
 owner='owner-B';
 const req=new Request(url,{method:'PUT',headers:{origin:url.origin,'content-type':'application/json','X-Account-Id':'owner-A'},body:JSON.stringify({version:0,snapshot:initialPortfolio()})});
 const response=await handler(req,env,url);
 assert.equal(response.status,403);
 assert.equal((await response.json()).error,'account_changed');
 assert.equal(database.records.size,0);
});
test('cross-site writes are blocked before storage operations',async()=>{
 const database=mockDb(),env={PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:database};
 owner='owner-A';
 const requestFromElsewhere=new Request(url,{method:'PUT',headers:{origin:'https://other.example','content-type':'application/json'},body:JSON.stringify({version:0,snapshot:initialPortfolio()})});
 const result=await handler(requestFromElsewhere,env,url);
 assert.equal(result.status,403);
 assert.equal(database.records.size,0);
});
