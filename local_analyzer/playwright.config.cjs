const path=require('node:path'),fs=require('node:fs');
const browserCache=path.resolve(__dirname,'../../.playwright-browsers');
if(fs.existsSync(browserCache))process.env.PLAYWRIGHT_BROWSERS_PATH=browserCache;
const fixture=path.join(__dirname,'tests/serve_browser_fixture.py');
module.exports={testDir:path.join(__dirname,'tests/browser'),workers:1,timeout:25000,
 outputDir:path.join(__dirname,'data/browser-results'),reporter:'list',
 webServer:[8766,8767].map(port=>({command:'python "'+fixture+'"'+(port===8767?' --company':''),cwd:__dirname,url:'http://127.0.0.1:'+port+'/api/health',reuseExistingServer:false,timeout:15000})),
 use:{browserName:'chromium',locale:'he-IL',viewport:{width:1440,height:1000},serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'},
 projects:[{name:'analyzer',testMatch:'analyzer.spec.cjs',use:{baseURL:'http://127.0.0.1:8766'}},{name:'companies',testMatch:'company-data.spec.cjs',use:{baseURL:'http://127.0.0.1:8767'}}]};
