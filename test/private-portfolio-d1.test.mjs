import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../cloudflare/src/private-portfolio.mjs',import.meta.url),'utf8');
const script=source.replace(/^import .*;\n/gm,'').replace('export async function handlePrivatePortfolio','async function handlePrivatePortfolio')+'\nthis.handlePrivatePortfolio=handlePrivatePortfolio;';
const initialPortfolio=()=>({cashCents:1500000,positions:{},trades:[]});
let authorized=true;
const context={Response,TextEncoder,JSON,Number,URL,initialPortfolio,
 getAuthorizedSession:async()=>authorized?{sub:'google-user-123'}:null,
 validatePortfolioLedger:p=>({valid:p?.cashCents===1500000&&Object.keys(p.positions||{}).length===0&&Array.isArray(p.trades)&&p.trades.length===0})};
vm.runInNewContext(script,context);
const handler=context.handlePrivatePortfolio;
const url=new URL('https://smarttrade-ai-preview.goshen-r.workers.dev/api/private/portfolio');
function db(){
 let row=null;let seen=[];
 return {seen,prepare(sql){const p={bind(...args){this.args=args;return this},async first(){seen.push({sql,args:this.args});return row},async run(){seen.push({sql,args:this.args});if(sql.startsWith('INSERT')){if(row)return {meta:{changes:0}};row={version:1,snapshot_json:this.args[1]};return {meta:{changes:1}}}if(row?.version!==this.args[2])return {meta:{changes:0}};row={version:row.version+1,snapshot_json:this.args[0]};return {meta:{changes:1}}}};return p}}
}
const env=()=>({PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:db()});
const request=(method,body,origin=url.origin)=>({method,headers:new Headers({'origin':origin,'content-type':'application/json'}),text:async()=>JSON.stringify(body)});
test('rejects anonymous sessions and missing feature flag',async()=>{
 authorized=false;const e=env();
 assert.equal((await handler(request('GET'),e,url)).status,401);
 authorized=true;
 assert.equal((await handler(request('GET'),{PORTFOLIO_DB:e.PORTFOLIO_DB},url)).status,503);
});
test('private GET returns initial portfolio without writing',async()=>{
 const e=env(),res=await handler(request('GET'),e,url);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{version:0,snapshot:initialPortfolio()});
 assert.equal(e.PORTFOLIO_DB.seen.length,1);
});
test('PUT enforces origin and integrity, then optimistic version checks',async()=>{
 const e=env();
 assert.equal((await handler(request('PUT',{version:0,snapshot:initialPortfolio()},'https://evil.example'),e,url)).status,403);
 assert.equal((await handler(request('PUT',{version:0,snapshot:{cashCents:1,positions:{},trades:[]}}),e,url)).status,400);
 let res=await handler(request('PUT',{version:0,snapshot:initialPortfolio()}),e,url);
 assert.equal(res.status,200);assert.equal((await res.json()).version,1);
 res=await handler(request('PUT',{version:0,snapshot:initialPortfolio()}),e,url);
 assert.equal(res.status,409);
 res=await handler(request('PUT',{version:1,snapshot:initialPortfolio()}),e,url);
 assert.equal((await res.json()).version,2);
 assert.equal((await (await handler(request('GET'),e,url)).json()).version,2);
 assert.ok(e.PORTFOLIO_DB.seen.every(x=>x.args[0]==='google-user-123'||x.sql.startsWith('UPDATE')));
});
test('Preview routing exists but D1 binding is not activated',()=>{
 const worker=fs.readFileSync(new URL('../cloudflare/src/preview.js',import.meta.url),'utf8');
 const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.preview.json',import.meta.url),'utf8'));
 assert.match(worker,/handlePrivatePortfolio\(request,env,url\)/);
 assert.equal(cfg.d1_databases,undefined);
});
