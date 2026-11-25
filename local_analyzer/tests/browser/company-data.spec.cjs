const {test,expect}=require('@playwright/test');
test.describe.configure({mode:'serial'});
test.beforeEach(async({page,context})=>{
 const errors=[],blocked=[],posts=[];page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>{const request=route.request();if(new URL(request.url()).origin!=='http://127.0.0.1:8767'){blocked.push(request.url());return route.abort()}if(request.method()==='POST')posts.push(new URL(request.url()).pathname);return route.continue()});
 page.companyEvidence={errors,blocked,posts};await page.goto('/');await expect(page.locator('#requestStatus')).not.toContainText('טוען');
});
test.afterEach(async({page})=>{expect(page.companyEvidence.errors).toEqual([]);expect(page.companyEvidence.blocked).toEqual([])});
test('cached financials show reporting period and source without automatic refresh',async({page})=>{
 await expect(page.locator('#fundamentals')).toContainText('TEST FINANCIAL FIXTURE');expect(page.companyEvidence.posts).toEqual([]);
 await expect(page.locator('#financialWarnings')).toContainText('Synthetic financial fixture');await expect(page.locator('#financialRows tr')).toHaveCount(11);
 await page.locator('#financialPeriod').selectOption('annual');await expect(page.locator('#financialProvenance')).toContainText('2025-12');await expect(page.locator('#financialRatios')).toContainText('25.00%');
 await page.locator('#financialPeriod').selectOption('trailing');await expect(page.locator('#financialRows tr')).toHaveCount(3);
});
test('automatic ranking loads twenty companies and exposes timestamp gaps and differences',async({page})=>{
 await page.locator('#refreshRanking').click();await expect(page.locator('#catalogHeading')).toContainText('אוטומטי');await expect(page.locator('#autoRankingRows tr')).toHaveCount(20);
 await expect(page.locator('#rankingNote')).toContainText('מועד שווי השוק עצמו לא נמסר');await expect(page.locator('#rankingWarnings')).toContainText('TEST1');
 expect(page.companyEvidence.posts).toEqual(['/api/ranking/refresh']);
});
test('financial refresh is manual and a rate-limit error retains the valid values',async({page})=>{
 const text=await page.locator('#financialRows').textContent();await page.locator('#refreshFundamentals').click();await expect(page.locator('#refreshFundamentals')).toBeEnabled();await expect(page.locator('#fundamentals')).toContainText('TEST FINANCIAL FIXTURE');
 await page.locator('#refreshFundamentals').click();await expect(page.locator('#error')).toContainText('המתן');await expect(page.locator('#financialRows')).toHaveText(text);
});
test('TOP20 comparison keeps missing companies, filters, and compares without provider calls',async({page})=>{
 await expect(page.locator('#screeningRows tr')).toHaveCount(20);
 await expect(page.locator('#screeningCoverage')).toContainText('/20');
 await page.getByLabel('השווה NVDA',{exact:true}).check();await page.getByLabel('השווה TEST1',{exact:true}).check();
 await expect(page.locator('#screeningDetails')).toContainText('NVDA');await expect(page.locator('#screeningDetails')).toContainText('TEST1');
 await expect(page.locator('#screeningDetails')).toContainText('לא זמין');
 await page.locator('#screeningFilter').selectOption('complete');await expect(page.locator('#screeningRows tr')).toHaveCount(0);
 await page.locator('#screeningFilter').selectOption('all');await expect(page.locator('#screeningRows tr')).toHaveCount(20);
 await page.locator('#screeningSort').selectOption('symbol');await page.locator('#reloadScreening').click();
 await expect(page.locator('#screeningRows button').first()).toBeEnabled();
 await page.locator('#screeningRows button').filter({hasText:/^TEST1 ·/}).click();
 await expect(page.locator('#symbolSelect')).toHaveValue('TEST1');await expect(page.locator('#empty')).toBeVisible();
 expect(page.companyEvidence.posts).toEqual([]);
});
test('company comparison limits side-by-side selection to four',async({page})=>{
 for(const symbol of ['NVDA','TEST1','TEST2','TEST3'])await page.getByLabel('השווה '+symbol,{exact:true}).check();
 await page.getByLabel('השווה TEST4',{exact:true}).click();await expect(page.getByLabel('השווה TEST4',{exact:true})).not.toBeChecked();
 await expect(page.locator('#screeningStatus')).toContainText('עד 4');expect(page.companyEvidence.posts).toEqual([]);
});
for(const width of [390,1440])test('financial tables and rank fit at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:1000});await page.getByText('הצג דירוג ומקורות',{exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/company-browser/company-'+width+'.png',fullPage:true});
});
