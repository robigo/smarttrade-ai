import {createHash} from 'node:crypto';

export function buildPreviewAccountConfig(base,{id,name,enabled}) {
  if(base.name!=='smarttrade-ai-preview'||base.main!=='cloudflare/src/preview.js'||base.assets?.directory!=='./preview-public'||base.workers_dev!==true||base.preview_urls!==false)throw Error('Unexpected Preview deployment target');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))throw Error('Reviewed Preview database ID required');
  if(!/^smarttrade-ai-preview-accounts-[a-z0-9-]+$/.test(name||''))throw Error('Reviewed Preview-only database name required');
  if(!['true','false'].includes(enabled))throw Error('Sync flag must be explicitly true or false');
  const cfg=structuredClone(base);
  cfg.d1_databases=[{binding:'PORTFOLIO_DB',database_name:name,database_id:id}];
  cfg.vars={...cfg.vars,PORTFOLIO_SYNC_ENABLED:enabled,MARKET_DISPLAY_APPROVED:'false',MARKET_QUOTA_GUARD_READY:'false',GOOGLE_APP_ORIGIN:'https://smarttrade-ai-preview.goshen-r.workers.dev'};
  return cfg;
}

export function resolvePreviewDeploymentConfig(base,policy,databases) {
  if(policy.worker!=='smarttrade-ai-preview'||policy.binding!=='PORTFOLIO_DB'||policy.sync_enabled!==true)throw Error('Approved Preview account policy required');
  if(!/^[a-f0-9]{64}$/.test(policy.database_id_sha256||''))throw Error('Approved database fingerprint required');
  if(!Array.isArray(databases))throw Error('D1 inventory response must be an array');
  const matches=databases.filter(db=>db?.name===policy.database_name);
  if(matches.length!==1)throw Error('Exactly one approved Preview database must exist; no fallback deployment is allowed');
  const id=matches[0].uuid;
  if(typeof id!=='string'||createHash('sha256').update(id.toLowerCase()).digest('hex')!==policy.database_id_sha256)throw Error('Preview database identity changed; review required');
  return buildPreviewAccountConfig(base,{id,name:policy.database_name,enabled:'true'});
}
