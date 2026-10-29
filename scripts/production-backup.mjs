import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {validatePortfolioLedger} from '../app/portfolio-ledger-integrity.mjs';

const format='smarttrade-production-portfolio-backup-v1';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
function validateRows(rows){
 if(!Array.isArray(rows))throw Error('Backup records missing');
 const owners=new Set();
 for(const row of rows){
  if(typeof row.owner_sub!=='string'||!row.owner_sub||owners.has(row.owner_sub)||!Number.isSafeInteger(row.version)||row.version<1||typeof row.snapshot_json!=='string')throw Error('Invalid backup record');
  let snapshot;try{snapshot=JSON.parse(row.snapshot_json)}catch{throw Error('Invalid stored portfolio JSON')}
  if(!validatePortfolioLedger(snapshot).valid)throw Error('Stored portfolio failed ledger validation');
  owners.add(row.owner_sub);
 }
}
const aad=meta=>Buffer.from(JSON.stringify([format,meta.databaseFingerprint,meta.schemaHash,meta.createdAt,meta.recordCount]));

export function createArchive(rows,schema,{databaseFingerprint,wrapKey}){
 validateRows(rows);
 if(!/^[a-f0-9]{64}$/.test(databaseFingerprint||''))throw Error('Reviewed production database fingerprint required');
 const meta={databaseFingerprint,schemaHash:sha256(schema),createdAt:new Date().toISOString(),recordCount:rows.length};
 const key=randomBytes(32),iv=randomBytes(12);
 try{
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(meta));
  const data=Buffer.concat([cipher.update(JSON.stringify(rows),'utf8'),cipher.final()]);
  return {format,protection:'AES-256-GCM; key wrapped by Windows DPAPI CurrentUser',meta,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),wrappedKey:Buffer.from(wrapKey(key)).toString('base64'),data:data.toString('base64')};
 }finally{key.fill(0)}
}

export function openArchive(archive,schema,{databaseFingerprint,unwrapKey}){
 if(archive?.format!==format||archive.protection!=='AES-256-GCM; key wrapped by Windows DPAPI CurrentUser'||archive.meta?.databaseFingerprint!==databaseFingerprint||archive.meta?.schemaHash!==sha256(schema))throw Error('Backup format, source or schema mismatch');
 const key=Buffer.from(unwrapKey(Buffer.from(archive.wrappedKey,'base64')));
 try{
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(archive.iv,'base64'));cipher.setAAD(aad(archive.meta));cipher.setAuthTag(Buffer.from(archive.tag,'base64'));
  const plaintext=Buffer.concat([cipher.update(Buffer.from(archive.data,'base64')),cipher.final()]);
  const rows=JSON.parse(plaintext.toString('utf8'));validateRows(rows);
  if(rows.length!==archive.meta.recordCount)throw Error('Backup record count mismatch');
  return rows;
 }finally{key.fill(0)}
}

export function verifyIsolatedRestore(rows,schema){
 validateRows(rows);
 // Only the reviewed local migration is executed. No SQL from an archive and
 // no connection to a live database is accepted by this restore verifier.
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(schema);
  const insert=db.prepare('INSERT INTO paper_portfolios(owner_sub,version,snapshot_json) VALUES (?,?,?)');
  db.exec('BEGIN');for(const row of rows)insert.run(row.owner_sub,row.version,row.snapshot_json);db.exec('COMMIT');
  const restored=db.prepare('SELECT owner_sub,version,snapshot_json FROM paper_portfolios ORDER BY owner_sub').all();
  const expected=[...rows].sort((a,b)=>a.owner_sub<b.owner_sub?-1:a.owner_sub>b.owner_sub?1:0);
  if(restored.length!==expected.length||restored.some((row,i)=>row.owner_sub!==expected[i].owner_sub||row.version!==expected[i].version||row.snapshot_json!==expected[i].snapshot_json))throw Error('Isolated restore did not match backup');
  return {recordsRestored:restored.length,exactMatch:true,liveDatabaseWrites:0};
 }finally{db.close()}
}

export function windowsProtect(key,unprotect=false){
 if(process.platform!=='win32')throw Error('This backup key requires Windows DPAPI CurrentUser');
 const method=unprotect?'Unprotect':'Protect';
 const code=`Add-Type -AssemblyName System.Security; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $outputBytes=[Security.Cryptography.ProtectedData]::${method}($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($outputBytes)`;
 const binary=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 const result=spawnSync(binary,['-NoProfile','-NonInteractive','-Command',code],{input:Buffer.from(key).toString('base64'),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});
 if(result.error||result.status!==0)throw Error('Windows user-bound key protection failed');
 return Buffer.from(result.stdout.trim(),'base64');
}
