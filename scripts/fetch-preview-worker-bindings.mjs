import {readPreviewWorkerBindings} from './preview-deployment-config.mjs';
const bindings=await readPreviewWorkerBindings({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN});
process.stdout.write(JSON.stringify(bindings)+'\n');
