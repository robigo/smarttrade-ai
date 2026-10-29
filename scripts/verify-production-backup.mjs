// Offline verification only: never connects to Cloudflare or writes a database.
import fs from 'node:fs';
import path from 'node:path';
import {openArchive,verifyIsolatedRestore,windowsProtect} from './production-backup.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(process.argv.length!==3)throw Error('Provide the encrypted backup JSON path');
const policy=JSON.parse(fs.readFileSync(path.join(root,'deployment/production-accounts.json')));
const schema=fs.readFileSync(path.join(root,'cloudflare/migrations/0001_paper_portfolios.sql'),'utf8');
const archive=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const rows=openArchive(archive,schema,{databaseFingerprint:policy.database_id_sha256,unwrapKey:key=>windowsProtect(key,true)});
console.log(JSON.stringify({backupCreatedAt:archive.meta.createdAt,...verifyIsolatedRestore(rows,schema),productionWrites:0},null,2));
