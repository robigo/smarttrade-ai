// Explicit remote integration drill for a newly approved, empty Preview DB.
// Uses local signed test sessions; never signs into or forges a live account.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,createHmac,createCipheriv,createDecipheriv} from 'node:crypto';
import {handlePrivatePortfolio} from '../cloudflare/src/private-portfolio.mjs';
import {initialPortfolio,executePaperTrade} from '../app/portfolio-engine.mjs';

assert.equal(process.env.SMARTTRADE_APPROVED_D1_SMOKE,'1','Explicit approval environment flag required');
const config=path.resolve(process.argv[2]||'wrangler.accounts-preview.json');
const cfg=JSON.parse(fs.readFileSync(config,'utf8'));
assert.equal(cfg.name,'smarttrade-ai-preview');
assert.equal(cfg.vars?.PORTFOLIO_SYNC_ENABLED,'false','Run the drill before enabling live account writes');
assert.equal(cfg.d1_databases?.length,1);
const database=cfg.d1_databases[0];
assert.equal(database.binding,'PORTFOLIO_DB');
assert.match(database.database_name,/^smarttrade-ai-preview-accounts-/);
assert.ok(database.database_id);
const cache=path.join(os.homedir(),'AppData/Local/npm-cache/_npx');
const cli=process.env.WRANGLER_CLI||fs.readdirSync(cache).map(dir=>path.join(cache,dir,'node_modules/wrangler/bin/wrangler.js')).find(file=>{
 try{return JSON.parse(fs.readFileSync(path.join(path.dirname(file),'../package.json'),'utf8')).version==='4.151.2';}catch{return false;}
});
assert.ok(cli,'Pinned Wrangler CLI must be installed');
const id=randomUUID(),owners=[`d1-smoke:${id}:A`,`d1-smoke:${id}:B`];
const out=path.resolve('../artifacts/d1-preview-smoke',id);
fs.mkdirSync(out,{recursive:true});
const report={startedAt:new Date().toISOString(),databaseName:database.database_name,scope:'Actual handler in Node with synthetic sessions and remote Preview D1',checks:[],productionTouched:false,paidProviderCalls:0};
const literal=value=>typeof value==='number'?(assert.ok(Number.isSafeInteger(value)),String(value)):"'"+String(value).replaceAll("'","''")+"'";
function wrangler(args){
 const result=spawnSync(process.execPath,[cli,...args,'--config',config],{encoding:'utf8',windowsHide:true,timeout:45000});
 if(result.error||result.status!==0)throw Error(`Wrangler failed: ${result.error?.message||result.stderr||result.stdout}`);
 return result.stdout.replace(/\u001b\[[0-9;]*m/g,'');
}
function sql(command){return JSON.parse(wrangler(['d1','execute','PORTFOLIO_DB','--remote','--command',command,'--json']));}
let calls=0;
const db={prepare(query){return {bind(...values){let i=0;this.command=query.replace(/\?/g,()=>literal(values[i++]));assert.equal(i,values.length);return this;},async first(){calls++;return sql(this.command)[0].results[0]||null;},async run(){calls++;return {meta:sql(this.command)[0].meta};}};}};
const settings={GOOGLE_CLIENT_ID:'synthetic-offline-client',GOOGLE_CLIENT_SECRET:'synthetic-offline-secret',GOOGLE_SESSION_SECRET:randomBytes(48).toString('hex'),GOOGLE_ALLOWED_EMAIL:'preview-smoke@example.invalid',PORTFOLIO_SYNC_ENABLED:'true',PORTFOLIO_DB:db};
const url=new URL('https://smarttrade-ai-preview.goshen-r.workers.dev/api/private/portfolio');
function request(owner,method,body,{origin=url.origin,headerOwner=owner}={}){
 const headers=new Headers();
 if(owner){const data=Buffer.from(JSON.stringify({sub:owner,email:settings.GOOGLE_ALLOWED_EMAIL,exp:Date.now()+3600000})).toString('base64url');const sig=createHmac('sha256',settings.GOOGLE_SESSION_SECRET).update(data).digest('base64url');headers.set('cookie','st_session='+data+'.'+sig);}
 if(method==='PUT'){headers.set('origin',origin);headers.set('content-type','application/json');headers.set('X-Account-Id',headerOwner);}
 return new Request(url,{method,headers,body:method==='PUT'?JSON.stringify(body):undefined});
}
async function invoke(owner,method,body,options){return handlePrivatePortfolio(request(owner,method,body,options),settings,url);}
function passed(name){report.checks.push({name,passed:true});console.log('PASS '+name);}
function protect(key,unprotect=false){
 const operation=unprotect?'Unprotect':'Protect';
 const code=`Add-Type -AssemblyName System.Security; $keyBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $resultBytes=[Security.Cryptography.ProtectedData]::${operation}($keyBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($resultBytes)`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{input:Buffer.from(key).toString('base64'),encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error('Windows user-bound key protection failed');
 return Buffer.from(result.stdout.trim(),'base64');
}
function decrypt(backup){
 const key=protect(Buffer.from(backup.wrappedKey,'base64'),true);
 const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(backup.iv,'base64'));
 cipher.setAAD(Buffer.from('smarttrade-preview-backup-v1'));cipher.setAuthTag(Buffer.from(backup.tag,'base64'));
 return Buffer.concat([cipher.update(Buffer.from(backup.data,'base64')),cipher.final()]);
}
const plain=path.join(out,'synthetic-data.sql'),restore=path.join(out,'synthetic-restore.sql');
let emptyVerified=false;
try{
 assert.equal(sql('SELECT count(*) AS count FROM paper_portfolios')[0].results[0].count,0,'Drill requires a new empty database');emptyVerified=true;
 const before=calls;
 assert.equal((await invoke(null,'GET')).status,401);assert.equal(calls,before);passed('anonymous request rejected before database access');
 const disabled=await handlePrivatePortfolio(request(owners[0],'GET'),{...settings,PORTFOLIO_SYNC_ENABLED:'false'},url);
 assert.equal(disabled.status,503);assert.equal(calls,before);passed('disabled sync rejects authenticated test session without database access');
 let response=await invoke(owners[0],'GET');assert.equal((await response.json()).version,0);passed('new account reads initial portfolio without writing');
 response=await invoke(owners[0],'PUT',{version:0,snapshot:initialPortfolio()});assert.equal((await response.json()).version,1);passed('initial account save persists in remote D1');
 const updated=executePaperTrade(initialPortfolio(),{symbol:'WORLD',side:'buy',quantity:2,priceCents:10000}).portfolio;
 response=await invoke(owners[0],'PUT',{version:1,snapshot:updated});assert.equal((await response.json()).version,2);passed('versioned update persists in remote D1');
 response=await invoke(owners[0],'PUT',{version:1,snapshot:initialPortfolio()});assert.equal(response.status,409);passed('stale write rejected');
 response=await invoke(owners[1],'GET');assert.equal((await response.json()).version,0);
 response=await invoke(owners[1],'PUT',{version:0,snapshot:initialPortfolio()});assert.equal(response.status,200);passed('second account is isolated from first account');
 const beforeGuards=calls;
 assert.equal((await invoke(owners[0],'PUT',{version:2,snapshot:updated},{origin:'https://other.invalid'})).status,403);
 assert.equal((await invoke(owners[0],'PUT',{version:2,snapshot:updated},{headerOwner:owners[1]})).status,403);
 assert.equal(calls,beforeGuards);passed('cross-origin and switched-account drafts rejected before storage');
 const persisted=await (await invoke(owners[0],'GET')).json();assert.equal(persisted.version,2);assert.deepEqual(persisted.snapshot,updated);passed('saved portfolio survives a fresh remote database read');
 assert.equal(sql('SELECT count(*) AS count FROM paper_portfolios')[0].results[0].count,2,'Only synthetic records may be exported');
 wrangler(['d1','export','PORTFOLIO_DB','--remote','--table','paper_portfolios','--no-schema','--output',plain,'--skip-confirmation']);
 const data=fs.readFileSync(plain);for(const owner of owners)assert.ok(data.includes(Buffer.from(owner)));
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from('smarttrade-preview-backup-v1'));
 const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
 const backup={format:'smarttrade-preview-backup-v1',protection:'AES-256-GCM; key wrapped by Windows DPAPI CurrentUser',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64'),wrappedKey:protect(key).toString('base64')};
 fs.writeFileSync(path.join(out,'backup.encrypted.json'),JSON.stringify(backup,null,2));
 const tampered={...backup,data:Buffer.from(encrypted.map((byte,i)=>i===0?byte^1:byte)).toString('base64')};
 assert.throws(()=>decrypt(tampered));passed('encrypted backup rejects modified ciphertext');
 const recovered=decrypt(JSON.parse(fs.readFileSync(path.join(out,'backup.encrypted.json'),'utf8')));assert.ok(recovered.equals(data));
 // The DB was verified empty before this drill and remains unavailable to
 // deployed account clients. Delete only this run's two synthetic subjects.
 sql('DELETE FROM paper_portfolios WHERE owner_sub IN ('+owners.map(literal).join(',')+')');
 assert.equal(sql('SELECT count(*) AS count FROM paper_portfolios')[0].results[0].count,0);
 fs.writeFileSync(restore,recovered);
 wrangler(['d1','execute','PORTFOLIO_DB','--remote','--file',restore,'--yes']);
 const restored=await (await invoke(owners[0],'GET')).json();assert.deepEqual(restored,persisted);
 assert.equal((await (await invoke(owners[1],'GET')).json()).version,1);passed('encrypted backup restores both synthetic accounts into remote D1');
 report.success=true;
}catch(error){report.success=false;report.error=error.message;process.exitCode=1;console.error(error.message);}
finally{
 if(emptyVerified){try{sql('DELETE FROM paper_portfolios WHERE owner_sub IN ('+owners.map(literal).join(',')+')');report.finalRows=sql('SELECT count(*) AS count FROM paper_portfolios')[0].results[0].count;assert.equal(report.finalRows,0);passed('synthetic records removed; Preview database left empty');}catch(error){report.success=false;report.cleanupError=error.message;process.exitCode=1;}}
 for(const file of [plain,restore])if(path.dirname(file)===out&&fs.existsSync(file))fs.unlinkSync(file);
 report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('Report: '+path.join(out,'report.json'));
}
