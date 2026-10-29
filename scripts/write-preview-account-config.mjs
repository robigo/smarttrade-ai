// Generate an ignored, Preview-only deployment config from reviewed metadata.
// Database identifiers are not credentials, but remain outside public docs.
import fs from 'node:fs';
import path from 'node:path';
import {buildPreviewAccountConfig} from './preview-deployment-config.mjs';
const root=path.resolve(import.meta.dirname,'..');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'wrangler.preview.json'),'utf8'));
const id=process.env.SMARTTRADE_PREVIEW_D1_ID,name=process.env.SMARTTRADE_PREVIEW_D1_NAME;
const enabled=process.env.SMARTTRADE_PREVIEW_SYNC_ENABLED||'false';
const output=buildPreviewAccountConfig(cfg,{id,name,enabled});
fs.writeFileSync(path.join(root,'wrangler.accounts-preview.json'),JSON.stringify(output,null,2)+'\n');
console.log('Generated ignored Preview account config; sync='+enabled+'; market provider disabled.');
