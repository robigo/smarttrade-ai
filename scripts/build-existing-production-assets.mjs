import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'existing-production-public');
const html=fs.readFileSync(path.join(root,'preview-public/index.html'),'utf8');
if(!html.includes('SmartTrade AI · v0.14 Preview'))throw Error('Review existing-site branding before build');
fs.mkdirSync(output,{recursive:true});
const personalHtml=html.replace('SmartTrade AI · v0.14 Preview','SmartTrade AI · v0.14')
 .replace('גישה למחירים עדיין אינה מופעלת.','שליפה ידנית ללמידה עצמית בלבד, לאחר התחברות. אין רענון אוטומטי.')
 .replace('המחירים ייטענו רק למשתמש Google מורשה ורק לאחר הפעלת רישוי בשרת. אין השפעה על מחירי הסימולציה או על שווי התיק.','שליפה ידנית דרך חשבון Basic למשתמש Google המורשה בלבד. עד 8 קרדיטים בדקה ו־800 ביום דרך כלי זה. אין השפעה על מחירי הסימולציה או על שווי התיק.')
 .replace('</html>','<script src="/personal-market-client.js"></script></html>');
fs.writeFileSync(path.join(output,'index.html'),personalHtml);
fs.copyFileSync(path.join(root,'preview-public/account-client.js'),path.join(output,'account-client.js'));
fs.copyFileSync(path.join(root,'app/personal-market-client.js'),path.join(output,'personal-market-client.js'));
console.log('Built optional app assets for existing gateway; no new Worker or runtime changes.');
