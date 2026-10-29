import {createHash} from 'node:crypto';
export function buildProductionAppConfig(base,{id,name,enabled},previewPolicy){
 if(base.name!=='smarttrade-ai-app'||base.main!=='cloudflare/src/production-app.mjs'||base.assets?.directory!=='./production-public'||base.workers_dev!==true||base.preview_urls!==false||base.vars?.GOOGLE_APP_ORIGIN!=='https://smarttrade-ai-app.goshen-r.workers.dev')throw Error('Unexpected production website target');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))throw Error('Reviewed production database ID required');
 if(!/^smarttrade-ai-production-accounts-[a-z0-9-]+$/.test(name||''))throw Error('Separate production account database required');
 if(!/^[a-f0-9]{64}$/.test(previewPolicy?.database_id_sha256||'')||createHash('sha256').update(id.toLowerCase()).digest('hex')===previewPolicy.database_id_sha256)throw Error('Production must not bind the Preview database');
 if(!['true','false'].includes(enabled))throw Error('Explicit production sync state required');
 const cfg=structuredClone(base);
 cfg.d1_databases=[{binding:'PORTFOLIO_DB',database_name:name,database_id:id}];
 cfg.vars={...cfg.vars,APP_ENVIRONMENT:'production',PORTFOLIO_SYNC_ENABLED:enabled,MARKET_DISPLAY_APPROVED:'false',MARKET_QUOTA_GUARD_READY:'false'};
 return cfg;
}
