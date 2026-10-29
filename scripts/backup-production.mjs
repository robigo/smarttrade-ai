// Read-only production capture; isolated restore uses in-memory SQLite only.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {resolveProductionDeploymentConfig,readProductionWorkerBindings} from './production-deployment-config.mjs';
import {sha256,createArchive,openArchive,verifyIsolatedRestore,windowsProtect} from './production-backup.mjs';
const root=path.resolve(import.meta.dirname,'..');
const schema=fs.readFileSync(path.join(root,'cloudflare/migrations/0001_paper_portfolios.sql'),'utf8');
const policy=JSON.parse(fs.readFileSync(path.join(root,'deployment/production-accounts.json')));
const base=JSON.parse(fs.readFileSync(path.join(root,'wrangler.existing-production.json')));
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const bindings=await readProductionWorkerBindings({accountId,token});
const config=resolveProductionDeploymentConfig(base,policy,bindings);
const databaseId=config.d1_databases[0].database_id;
// Check key protection before retrieving any real account data.
const probe=Buffer.alloc(32,7);
if(!windowsProtect(windowsProtect(probe),true).equals(probe))throw Error('Backup key recovery preflight failed');
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:'SELECT owner_sub,version,snapshot_json FROM paper_portfolios ORDER BY owner_sub'}),redirect:'error',signal:AbortSignal.timeout(30000)});
let body;try{body=await response.json()}catch{throw Error('Production backup query returned invalid JSON')}
if(!response.ok||body.success!==true||body.result?.length!==1||body.result[0].success!==true||!Array.isArray(body.result[0].results))throw Error(`Production backup read failed (HTTP ${response.status})`);
const rows=body.result[0].results;
const archive=createArchive(rows,schema,{databaseFingerprint:policy.database_id_sha256,wrapKey:key=>windowsProtect(key)});
// Default storage is ignored and contains no plaintext account exports.
const output=path.resolve(process.env.SMARTTRADE_BACKUP_DIR||path.join(root,'../artifacts/private-production-backups'));
fs.mkdirSync(output,{recursive:true});
const name=archive.meta.createdAt.replace(/[:.]/g,'-')+'-'+randomUUID();
const file=path.join(output,name+'.encrypted.json');
fs.writeFileSync(file,JSON.stringify(archive),{flag:'wx',mode:0o600});
const stored=JSON.parse(fs.readFileSync(file,'utf8'));
const recovered=openArchive(stored,schema,{databaseFingerprint:policy.database_id_sha256,unwrapKey:key=>windowsProtect(key,true)});
const verification=verifyIsolatedRestore(recovered,schema);
const report={createdAt:archive.meta.createdAt,archive:path.basename(file),archiveSha256:sha256(fs.readFileSync(file)),sourceIdentityVerified:true,encrypted:true,keyProtection:'Windows DPAPI CurrentUser',recordCount:rows.length,restore:verification,plaintextFilesWritten:0,productionWrites:0,paidProviderCalls:0,automaticScheduleConfigured:false,portability:'Recovery requires the current Windows user DPAPI keys; independently escrowed portable recovery is not configured.'};
fs.writeFileSync(path.join(output,name+'.report.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({...report,backupDirectory:output},null,2));
