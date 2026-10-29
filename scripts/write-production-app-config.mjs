import fs from 'node:fs';
import path from 'node:path';
import {buildProductionAppConfig} from './production-app-config.mjs';
const root=path.resolve(import.meta.dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const cfg=buildProductionAppConfig(read('wrangler.production-app.json'),{
 id:process.env.SMARTTRADE_PRODUCTION_D1_ID,
 name:process.env.SMARTTRADE_PRODUCTION_D1_NAME,
 enabled:process.env.SMARTTRADE_PRODUCTION_SYNC_ENABLED||'false',
},read('deployment/preview-accounts.json'));
fs.writeFileSync(path.join(root,'wrangler.production-app.generated.json'),JSON.stringify(cfg,null,2)+'\n');
console.log('Generated separate production website config; Preview database rejected and market provider disabled.');
