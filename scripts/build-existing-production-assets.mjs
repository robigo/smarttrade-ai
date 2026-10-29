import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PERSONAL_MARKET_INSTRUMENTS,PERSONAL_SYMBOLS} from '../app/personal-market-symbols.mjs';
export function buildExistingProductionHtml(html){
 if(!html.includes('SmartTrade AI · v0.14 Preview'))throw Error('Review existing-site branding before build');
 for(const id of ['liveSymbol','watchChoice'])if(!new RegExp('<select id="'+id+'">[\\s\\S]*?</select>').test(html))throw Error('Market symbol selector missing: '+id);
 if(!html.includes("watchAllowed=['AAPL','MSFT','SPY']"))throw Error('Review watchlist validation before build');
 const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const options=PERSONAL_MARKET_INSTRUMENTS.map(item=>'<option value="'+item.symbol+'">'+escape(item.symbol+' — '+item.name)+'</option>').join('');
 return html.replace('SmartTrade AI · v0.14 Preview','SmartTrade AI · v0.14')
 .replace('גישה למחירים עדיין אינה מופעלת.','שליפה ידנית ללמידה עצמית בלבד, לאחר התחברות. אין רענון אוטומטי.')
 .replace('המחירים ייטענו רק למשתמש Google מורשה ורק לאחר הפעלת רישוי בשרת. אין השפעה על מחירי הסימולציה או על שווי התיק.','שליפה ידנית דרך חשבון Basic למשתמש Google המורשה בלבד. עד 8 קרדיטים בדקה ו־800 ביום דרך כלי זה. אין השפעה על מחירי הסימולציה או על שווי התיק.')
 .replace(/<select id="liveSymbol">[\s\S]*?<\/select>/,'<select id="liveSymbol">'+options+'</select>')
 .replace(/<select id="watchChoice">[\s\S]*?<\/select>/,'<select id="watchChoice">'+options+'</select>')
 .replace("watchAllowed=['AAPL','MSFT','SPY']",'watchAllowed='+JSON.stringify(PERSONAL_SYMBOLS))
 .replace('</html>','<script src="/personal-market-client.js"></script></html>');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(import.meta.dirname,'..');
 const output=path.join(root,'existing-production-public');
 const html=fs.readFileSync(path.join(root,'preview-public/index.html'),'utf8');
 const personalHtml=buildExistingProductionHtml(html);
 fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'index.html'),personalHtml);
 fs.copyFileSync(path.join(root,'preview-public/account-client.js'),path.join(output,'account-client.js'));
 fs.copyFileSync(path.join(root,'app/personal-market-client.js'),path.join(output,'personal-market-client.js'));
 console.log('Built optional app assets for existing gateway; no new Worker or runtime changes.');
}
