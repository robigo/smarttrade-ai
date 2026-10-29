import {createHash} from 'node:crypto';

export function resolveProductionDeploymentConfig(base,policy,bindings){
 if(base.name!=='smarttrade-ai'||base.main!=='cloudflare/src/index.js'||base.workers_dev!==true||base.preview_urls!==false||base.assets?.directory!=='./existing-production-public'||base.assets.binding!=='ASSETS'||base.assets.run_worker_first!==true)throw Error('Unexpected production target');
 if(policy.worker!=='smarttrade-ai'||policy.binding!=='PORTFOLIO_DB'||policy.sync_enabled!==true||!/^smarttrade-ai-production-accounts-[a-z0-9-]+$/.test(policy.database_name||'')||!/^[a-f0-9]{64}$/.test(policy.database_id_sha256||''))throw Error('Approved production storage policy required');
 if(!Array.isArray(bindings))throw Error('Worker bindings must be an array');
 const matches=bindings.filter(x=>x?.name===policy.binding);
 if(matches.length!==1||matches[0].type!=='d1')throw Error('Exactly one existing production D1 binding required');
 const id=matches[0].id;
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')||createHash('sha256').update(id.toLowerCase()).digest('hex')!==policy.database_id_sha256)throw Error('Production database identity changed; deployment stopped');
 const cfg=structuredClone(base);
 cfg.d1_databases=[{binding:policy.binding,database_name:policy.database_name,database_id:id}];
 cfg.vars={...cfg.vars,ACCOUNT_APP_ENABLED:'true',PORTFOLIO_SYNC_ENABLED:'true',GOOGLE_APP_ORIGIN:'https://smarttrade-ai.goshen-r.workers.dev',MARKET_DISPLAY_APPROVED:'false',MARKET_QUOTA_GUARD_READY:'false'};
 return cfg;
}

export async function readProductionWorkerBindings({accountId,token,fetchImpl=fetch}){
 if(!/^[a-f0-9]{32}$/i.test(accountId||'')||typeof token!=='string'||!token||/\s/.test(token))throw Error('Cloudflare account and deployment token required');
 const r=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/smarttrade-ai/settings`,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 let data;try{data=await r.json()}catch{throw Error('Cloudflare settings response was not JSON')}
 if(!r.ok||data.success!==true)throw Error(`Production Worker settings read failed (HTTP ${r.status})`);
 if(!Array.isArray(data.result?.bindings))throw Error('Production Worker bindings missing');
 return data.result.bindings.filter(x=>x.name==='PORTFOLIO_DB').map(({name,type,id})=>({name,type,id}));
}
