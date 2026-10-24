import {readFileSync, appendFileSync, writeFileSync} from 'node:fs';

const checks=[];
function record(name,passed,details=''){checks.push({name,passed,details});}
function file(path){return readFileSync(path,'utf8')}
const config=JSON.parse(file('wrangler.preview.json'));
record('Isolated Cloudflare target',config.name==='smarttrade-ai-preview'&&config.workers_dev===true);
record('Preview assets isolated',config.assets?.directory==='./preview-public');
const worker=file('cloudflare/src/preview.js');
record('Authentication enforced on market endpoints',worker.includes('getAuthorizedSession')&&worker.includes("market_display_disabled"));
record('Quota guard required for live quotes',worker.includes('MARKET_QUOTA_GUARD_READY')&&worker.includes('MARKET_QUOTA'));
record('No live broker order route',!worker.includes('/api/orders')&&!worker.includes('/api/trade/execute'));
const ui=file('preview-public/index.html');
record('Simulation-only UI warning',ui.includes('אין מסחר אמיתי'));
record('Browser smoke coverage exists',file('test/preview-ui-smoke.mjs').includes('חריגה מתקרת המניות'));
const missing=[
  'Authenticated Google login and session lifecycle in deployed Preview',
  'Unauthorized access and CSRF/cookie security end-to-end',
  'API quota concurrency and provider failure under load',
  'Performance and recovery under realistic conditions',
  'Operational rollback, incident response, and approval evidence',
  'Explicit production deployment approval'
];
const decision={productionReady:checks.every(x=>x.passed)&&missing.length===0,checks,blockers:missing,generatedAt:new Date().toISOString()};
writeFileSync('production-readiness-report.json',JSON.stringify(decision,null,2)+'\n');
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'production_ready='+decision.productionReady+'\n');
const report=['# SmartTrade pre-production readiness gate','',...checks.map(x=>'- '+(x.passed?'PASS':'FAIL')+' '+x.name),'','## Required before production',...missing.map(x=>'- BLOCKED: '+x),'','**Decision: '+(decision.productionReady?'READY FOR HUMAN APPROVAL':'NOT PRODUCTION READY')+'. No deployment or secrets changes.**',''];
const output=report.join('\n');
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,output);
console.log(output);
if(checks.some(x=>!x.passed))process.exitCode=1;
