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

export function resolvePreviewDeploymentConfig(base,policy,bindings) {
  if(policy.worker!=='smarttrade-ai-preview'||policy.binding!=='PORTFOLIO_DB'||policy.sync_enabled!==true)throw Error('Approved Preview account policy required');
  if(!/^[a-f0-9]{64}$/.test(policy.database_id_sha256||''))throw Error('Approved database fingerprint required');
  if(!Array.isArray(bindings))throw Error('Worker bindings response must be an array');
  const matches=bindings.filter(binding=>binding?.name===policy.binding);
  if(matches.length!==1||matches[0].type!=='d1')throw Error('Exactly one existing Preview D1 binding is required; no fallback deployment is allowed');
  const id=matches[0].id;
  if(typeof id!=='string'||createHash('sha256').update(id.toLowerCase()).digest('hex')!==policy.database_id_sha256)throw Error('Preview database identity changed; review required');
  return buildPreviewAccountConfig(base,{id,name:policy.database_name,enabled:'true'});
}

export async function readPreviewWorkerBindings({accountId,token,fetchImpl=fetch}) {
  if(!/^[a-f0-9]{32}$/i.test(accountId||''))throw Error('Valid Cloudflare account ID required');
  if(typeof token!=='string'||!token||/\s/.test(token))throw Error('Cloudflare deployment token required');
  const response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/smarttrade-ai-preview/settings`,{
    method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),
  });
  let data;try{data=await response.json();}catch{throw Error('Cloudflare Worker settings response was not JSON');}
  if(!response.ok||data.success!==true){const code=data.errors?.[0]?.code;throw Error(`Cloudflare Worker settings read failed (HTTP ${response.status}, code ${Number.isSafeInteger(code)?code:'unknown'})`);}
  if(!Array.isArray(data.result?.bindings))throw Error('Cloudflare Worker bindings are missing');
  // Never write environment variables, secret metadata or unrelated bindings
  // to CI output. Only the existing account-store binding is needed.
  return data.result.bindings.filter(binding=>binding.name==='PORTFOLIO_DB').map(({name,type,id})=>({name,type,id}));
}
