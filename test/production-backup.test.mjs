import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialPortfolio} from '../app/portfolio-engine.mjs';
import {createArchive,openArchive,verifyIsolatedRestore} from '../scripts/production-backup.mjs';
const schema=fs.readFileSync(new URL('../cloudflare/migrations/0001_paper_portfolios.sql',import.meta.url),'utf8');
const options={databaseFingerprint:'a'.repeat(64),wrapKey:key=>Buffer.from(key),unwrapKey:key=>Buffer.from(key)};
const rows=()=>[{owner_sub:'synthetic-owner-A',version:3,snapshot_json:JSON.stringify(initialPortfolio())},{owner_sub:'synthetic-owner-B',version:1,snapshot_json:JSON.stringify(initialPortfolio())}];
test('encrypted backup restores identities, exact versions and ledgers into isolated SQLite',()=>{
 const input=rows(),archive=createArchive(input,schema,options),recovered=openArchive(archive,schema,options);
 assert.deepEqual(recovered,input);assert.deepEqual(verifyIsolatedRestore(recovered,schema),{recordsRestored:2,exactMatch:true,liveDatabaseWrites:0});
 assert.ok(!JSON.stringify(archive).includes('synthetic-owner-A'));
});
test('changed ciphertext, tag and authenticated metadata fail before restore',()=>{
 const original=createArchive(rows(),schema,options);
 for(const field of ['data','tag']){const a=structuredClone(original),bytes=Buffer.from(a[field],'base64');bytes[0]^=1;a[field]=bytes.toString('base64');assert.throws(()=>openArchive(a,schema,options));}
 for(const field of ['recordCount','createdAt']){const a=structuredClone(original);a.meta[field]=field==='recordCount'?99:'2020-01-01';assert.throws(()=>openArchive(a,schema,options));}
});
test('wrong production identity, schema or decryption key cannot restore a backup',()=>{
 const a=createArchive(rows(),schema,options);
 assert.throws(()=>openArchive(a,schema,{...options,databaseFingerprint:'b'.repeat(64)}),/mismatch/);
 assert.throws(()=>openArchive(a,schema+'\n--different',options),/mismatch/);
 assert.throws(()=>openArchive(a,schema,{...options,unwrapKey:()=>Buffer.alloc(32)}));
});
test('invalid ledgers and duplicate account identifiers are rejected',()=>{
 assert.throws(()=>createArchive([...rows(),rows()[0]],schema,options));
 const invalid=rows();invalid[0].snapshot_json='{}';assert.throws(()=>createArchive(invalid,schema,options),/ledger/);
});
test('empty account store remains recoverable',()=>{
 const restored=openArchive(createArchive([],schema,options),schema,options);
 assert.equal(verifyIsolatedRestore(restored,schema).recordsRestored,0);
});
