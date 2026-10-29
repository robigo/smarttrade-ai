import fs from 'node:fs';
import path from 'node:path';
import {resolveProductionDeploymentConfig,readProductionWorkerBindings} from './production-deployment-config.mjs';
const root=path.resolve(import.meta.dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const output=path.join(root,'wrangler.accounts-existing-production.json');
// A failed refresh must never leave a stale config available to the next command.
fs.rmSync(output,{force:true});
const bindings=await readProductionWorkerBindings({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN});
const cfg=resolveProductionDeploymentConfig(read('wrangler.existing-production.json'),read('deployment/production-accounts.json'),bindings);
fs.writeFileSync(output,JSON.stringify(cfg,null,2)+'\n');
console.log('Existing production account-store identity verified; runtime secrets remain managed by Cloudflare.');
