// Generate an ignored, Preview-only deployment config from reviewed metadata.
// Database identifiers are not credentials, but remain outside public docs.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'wrangler.preview.json'),'utf8'));
if(cfg.name!=='smarttrade-ai-preview'||cfg.main!=='cloudflare/src/preview.js'||cfg.assets?.directory!=='./preview-public')throw Error('Unexpected Preview target');
const id=process.env.SMARTTRADE_PREVIEW_D1_ID,name=process.env.SMARTTRADE_PREVIEW_D1_NAME;
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))throw Error('Reviewed Preview database ID required');
if(!/^smarttrade-ai-preview-accounts-[a-z0-9-]+$/.test(name||''))throw Error('Reviewed Preview-only database name required');
const enabled=process.env.SMARTTRADE_PREVIEW_SYNC_ENABLED||'false';
if(!['true','false'].includes(enabled))throw Error('Sync flag must be explicitly true or false');
cfg.d1_databases=[{binding:'PORTFOLIO_DB',database_name:name,database_id:id}];
cfg.vars={PORTFOLIO_SYNC_ENABLED:enabled,MARKET_DISPLAY_APPROVED:'false',MARKET_QUOTA_GUARD_READY:'false',GOOGLE_APP_ORIGIN:'https://smarttrade-ai-preview.goshen-r.workers.dev'};
fs.writeFileSync(path.join(root,'wrangler.accounts-preview.json'),JSON.stringify(cfg,null,2)+'\n');
console.log('Generated ignored Preview account config; sync='+enabled+'; market provider disabled.');
