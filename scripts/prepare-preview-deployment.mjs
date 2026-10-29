import fs from 'node:fs';
import path from 'node:path';
import {resolvePreviewDeploymentConfig} from './preview-deployment-config.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(process.argv.length!==3)throw Error('Provide existing Worker binding metadata JSON');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const cfg=resolvePreviewDeploymentConfig(
  read(path.join(root,'wrangler.preview.json')),
  read(path.join(root,'deployment/preview-accounts.json')),
  read(process.argv[2]),
);
fs.writeFileSync(path.join(root,'wrangler.accounts-preview.json'),JSON.stringify(cfg,null,2)+'\n');
console.log('Approved Preview database verified; account sync preserved and paid market provider disabled.');
