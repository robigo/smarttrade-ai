import {chartScale} from '/chart-model.mjs';
const el=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const money=value=>Number.isFinite(value)?new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value):'לא זמין';
const compact=value=>new Intl.NumberFormat('he-IL',{notation:'compact',maximumFractionDigits:1}).format(value);
const day=value=>new Date(value+'T00:00:00Z').toLocaleDateString('he-IL',{timeZone:'UTC'});
const moment=value=>new Date(value).toLocaleString('he-IL');
const pct=value=>Number.isFinite(value)?(value>=0?'+':'')+value.toFixed(2)+'%':'לא זמין';
let analysis=null,financials=null,catalog=[],busy=false,offset=0,count=66,revision=0,historical=false,screening=null;
const compared=new Set();
function node(tag,attrs={},text){const item=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))item.setAttribute(key,String(value));if(text!==undefined)item.textContent=text;return item}
function error(message){el('error').textContent=message;el('error').hidden=!message}
async function request(url,body){const timeout=['/api/ranking/refresh','/api/fundamentals/refresh'].includes(url)?90000:25000;const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout),...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});let value;try{value=await response.json()}catch{throw Error('השרת לא החזיר JSON תקין.')}if(!response.ok)throw Error(value.error||'בקשה נכשלה: '+response.status);return value}
function setBusy(value){busy=value;for(const id of ['symbolSelect','refresh','importCSV','importRanking','refreshRanking','refreshFundamentals'])el(id).disabled=value;for(const button of document.querySelectorAll('[data-symbol],.history-list button,#comparisonRows button,#autoRankingRows button,#screeningRows button'))button.disabled=value;el('requestStatus').textContent=value?'טוען ומחשב...':'אין רענון אוטומטי. השליפה הבאה רק בלחיצה.'}
function details(bar){el('barDetails').textContent=day(bar.date)+' · פתיחה '+money(bar.open)+' · גבוה '+money(bar.high)+' · נמוך '+money(bar.low)+' · סגירה '+money(bar.close)+' USD · מחזור '+new Intl.NumberFormat('en-US').format(bar.volume)}
function drawOscillator(id,points,keys,colors,fixedRange){
 const svg=el(id),width=Math.max(280,Math.round(svg.clientWidth));svg.replaceChildren();svg.setAttribute('viewBox','0 0 '+width+' 110');
 const values=points.flatMap(point=>keys.map(key=>point[key]).filter(Number.isFinite));if(!values.length)return;
 const lo=fixedRange?.[0]??Math.min(0,...values),hi=fixedRange?.[1]??Math.max(0,...values),span=hi-lo||1;
 const x=index=>64+(width-88)*(points.length===1?.5:index/(points.length-1)),y=value=>10+(hi-value)/span*80;
 for(const value of fixedRange?[30,70]:[0])svg.append(node('line',{x1:64,x2:width-24,y1:y(value),y2:y(value),stroke:'#43576b','stroke-dasharray':'3 4'}),node('text',{x:54,y:y(value)+4,'text-anchor':'end'},money(value)));
 keys.forEach((key,color)=>{const coordinates=points.flatMap((point,index)=>Number.isFinite(point[key])?[x(index)+','+y(point[key])]:[]);if(coordinates.length>1)svg.append(node('polyline',{points:coordinates.join(' '),fill:'none',stroke:colors[color],'stroke-width':2}))});
}
function draw(){
 if(!analysis)return;
 const all=analysis.bars,end=all.length-offset,start=Math.max(0,end-count),points=all.slice(start,end);if(!points.length)return;
 const svg=el('priceChart'),vol=el('volumeChart'),width=Math.max(280,Math.round(svg.clientWidth));svg.replaceChildren();vol.replaceChildren();svg.setAttribute('viewBox','0 0 '+width+' 330');vol.setAttribute('viewBox','0 0 '+width+' 90');
 const enabled=[['ma20','show20','#efb86b'],['ma50','show50','#a69cf3'],['ma100','show100','#75b7f4'],['ma200','show200','#ed9fb5'],['bbUpper','showBB','#b3c5d1'],['bbLower','showBB','#b3c5d1']];
 const scalePoints=points.map(point=>({...point,...Object.fromEntries(enabled.filter(([,id])=>!el(id).checked).map(([key])=>[key,null]))}));
 const {x,y,low,high}=chartScale(scalePoints,width);
 for(let i=0;i<5;i++){const value=low+(high-low)*i/4;svg.append(node('line',{x1:64,x2:width-24,y1:y(value),y2:y(value),stroke:'#293c4e','stroke-dasharray':'3 5'}),node('text',{x:54,y:y(value)+4,'text-anchor':'end'},money(value)))}
 const color=bar=>bar.close>=bar.open?'#49d2b0':'#ff929a',barWidth=Math.max(.5,Math.min(11,(width-88)*.7/points.length));
 if(el('chartType').value==='candles')points.forEach((point,index)=>{const group=node('g',{'data-candle':point.date});group.append(node('line',{x1:x(index),x2:x(index),y1:y(point.high),y2:y(point.low),stroke:color(point)}),node('rect',{x:x(index)-barWidth/2,y:Math.min(y(point.open),y(point.close)),width:barWidth,height:Math.max(1,Math.abs(y(point.open)-y(point.close))),fill:color(point)}));svg.append(group)});
 else svg.append(node('polyline',{'data-series':'close',points:points.map((bar,index)=>x(index)+','+y(bar.close)).join(' '),fill:'none',stroke:'#49d2b0','stroke-width':2}));
 for(const [key,id,colorValue] of enabled){if(!el(id).checked)continue;const coordinates=points.flatMap((point,index)=>Number.isFinite(point[key])?[x(index)+','+y(point[key])]:[]);if(coordinates.length>1)svg.append(node('polyline',{'data-series':key,points:coordinates.join(' '),fill:'none',stroke:colorValue,'stroke-width':1.6}))}
 const maxVolume=Math.max(1,...points.map(bar=>bar.volume));
 points.forEach((point,index)=>{
  vol.append(node('rect',{x:x(index)-barWidth/2,y:80-point.volume/maxVolume*70,width:barWidth,height:point.volume/maxVolume*70,fill:color(point),opacity:.55}));
  const hitWidth=Math.max(barWidth,(width-88)/points.length),hit=node('rect',{x:x(index)-hitWidth/2,y:24,width:hitWidth,height:256,class:'hit',tabindex:0,role:'img','aria-label':day(point.date)+' סגירה '+money(point.close)+' דולר'});hit.addEventListener('pointerenter',()=>details(point));hit.addEventListener('focus',()=>details(point));svg.append(hit);
 });
 [0,Math.floor((points.length-1)/2),points.length-1].forEach((index,label)=>svg.append(node('text',{x:x(index),y:315,'text-anchor':label===0?'start':label===2?'end':'middle'},day(points[index].date))));
 svg.onpointerleave=()=>details(points.at(-1));details(points.at(-1));
 el('pointCount').textContent=points.length+' ימים · '+day(points[0].date)+'–'+day(points.at(-1).date);el('older').disabled=start===0;el('newer').disabled=offset===0;
 const change=points.length>1?(points.at(-1).close/points[0].close-1)*100:null;el('periodChange').textContent=pct(change);el('periodChange').className=change>=0?'positive':'negative';
 el('periodHigh').textContent=money(Math.max(...points.map(bar=>bar.high)));el('periodLow').textContent=money(Math.min(...points.map(bar=>bar.low)));
 drawOscillator('rsiChart',points,['rsi'],['#a69cf3'],[0,100]);drawOscillator('macdChart',points,['macd','signal'],['#49d2b0','#efb86b']);
}
function tableRow(values){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell)}return row}
function render(){
 el('empty').hidden=!!analysis;el('analysisPanel').hidden=!analysis;if(!analysis)return;
 const bars=analysis.bars,last=bars.at(-1),previous=bars.at(-2),change=previous?(last.close/previous.close-1)*100:null;
 el('instrumentName').textContent=analysis.name;el('instrumentSymbol').textContent=analysis.symbol;el('instrumentMeta').textContent='חישוב מקומי · '+bars.length+' נרות יומיים';
 el('lastPrice').textContent=money(last.close);const changeNode=document.createElement('bdi');changeNode.dir='ltr';changeNode.textContent=pct(change);el('dailyChange').replaceChildren(changeNode,document.createTextNode(' לעומת הסגירה הקודמת'));el('dailyChange').className=change>=0?'positive':'negative';
 el('lastDate').textContent='תאריך נתונים: '+day(analysis.dataDate);el('lastVolume').textContent=compact(last.volume);
 el('dataOrigin').textContent=(historical?'גרסה היסטורית שמורה · ':'')+analysis.source;
 el('sourceLine').textContent='נתונים עד '+day(analysis.dataDate)+' · התקבלו '+moment(analysis.fetchedAt)+' · '+(analysis.providerIntegration==='manual-csv'?'CSV מיובא; בסיס התאמה לפי הקובץ.':'OHLC מתואמים לפי סגירה מתואמת של הספק; מחזור ללא התאמה.');
 const age=Math.max(0,Math.floor((Date.now()-Date.parse(analysis.dataDate+'T00:00:00Z'))/86400000));
 el('dataWarning').textContent=analysis.warning+' גיל הנר האחרון: '+age+' ימים קלנדריים.'+(analysis.omittedRows?' הושמטו '+analysis.omittedRows+' נרות חלקיים או חסרים.':'');
 el('sourceLink').hidden=!analysis.sourceUrl;if(analysis.sourceUrl)el('sourceLink').href=analysis.sourceUrl;
 const score=analysis.score;el('scoreText').textContent=Number.isFinite(score)?score:'—';el('scoreGauge').setAttribute('aria-label',Number.isFinite(score)?'ציון טכני '+score+' מתוך 100':'אין מספיק נתונים לציון');el('scoreArc').setAttribute('stroke-dasharray',(Number.isFinite(score)?score/100*352:0)+' 352');el('scoreLabel').textContent=Number.isFinite(score)?'ציון המחושב מהמחירים השמורים':'נדרשת היסטוריה ארוכה יותר לציון מלא';el('scoreMethod').textContent=analysis.scoreMethod;el('scoreParts').replaceChildren(...analysis.scoreParts.map(part=>{const li=document.createElement('li');li.textContent=part.label+': '+part.points+' מתוך '+part.weight;return li}));
 const labels={ma20:'MA20',ma50:'MA50',ma100:'MA100',ma200:'MA200',rsi:'RSI (14)',macd:'MACD (12,26)',signal:'קו איתות (9)',histogram:'MACD Histogram',adx:'ADX (14)',atr:'ATR (14) · USD',plusDI:'+DI',minusDI:'−DI',bbUpper:'Bollinger עליון',bbMiddle:'Bollinger אמצעי',bbLower:'Bollinger תחתון'};
 el('indicatorRows').replaceChildren(...Object.entries(labels).map(([key,label])=>tableRow([label,money(analysis.indicators[key])])));
 el('levels').textContent='נמוך בטווח: '+money(analysis.levels.support)+' · גבוה בטווח: '+money(analysis.levels.resistance)+' USD';el('levelsMethod').textContent=analysis.levels.method;
 for(const key of ['bullish','neutral','bearish'])el(key).textContent=analysis.scenarios[key];
 el('recentRows').replaceChildren(...bars.slice(-5).reverse().map(bar=>tableRow([day(bar.date),money(bar.close),compact(bar.volume)])));draw();
}
async function lists(){
 await loadScreening();
 const symbol=el('symbolSelect').value;
 const [history,comparison]=await Promise.all([request('/api/history?symbol='+encodeURIComponent(symbol)),request('/api/comparison')]);
 el('historyRows').replaceChildren(...history.items.map(item=>{const button=document.createElement('button');button.textContent='נתונים: '+day(item.dataDate)+' · נשמר: '+moment(item.fetchedAt)+' · ציון: '+(item.score??'לא זמין')+' · '+item.source;button.onclick=async()=>{if(busy)return;setBusy(true);try{const data=await request('/api/snapshot?id='+item.id);analysis=data.analysis;historical=true;offset=0;render();error('')}catch(err){error(err.message)}finally{setBusy(false)}};return button}));
 if(!history.items.length)el('historyRows').textContent='אין עדיין ניתוחים שמורים למניה זו.';
 el('comparisonRows').replaceChildren(...comparison.items.map(item=>{const row=tableRow(['',item.score??'לא זמין',day(item.dataDate),item.source]),button=document.createElement('button');button.textContent=item.symbol;button.onclick=()=>choose(item.symbol,item.name);row.cells[0].append(button);return row}));
}
function option(symbol,name){if(![...el('symbolSelect').options].some(item=>item.value===symbol)){const item=document.createElement('option');item.value=symbol;item.textContent=symbol+' — '+name;el('symbolSelect').append(item)}}
async function choose(symbol,name=symbol){if(busy)return;option(symbol,name);el('symbolSelect').value=symbol;await load()}
async function load(){const own=++revision;setBusy(true);error('');try{const symbol=encodeURIComponent(el('symbolSelect').value),[data,finance]=await Promise.all([request('/api/data?symbol='+symbol),request('/api/fundamentals?symbol='+symbol)]);if(own!==revision)return;analysis=data.analysis;financials=finance.fundamentals;historical=false;offset=0;render();renderFinancials();await lists()}catch(err){error(err.message)}finally{if(own===revision)setBusy(false)}}
async function update(url,body){if(busy)return;setBusy(true);error('');try{const data=await request(url,body);analysis=data.analysis;historical=false;offset=0;render();financials=(await request('/api/fundamentals?symbol='+encodeURIComponent(el('symbolSelect').value))).fundamentals;renderFinancials();await lists()}catch(err){error(err.message+(analysis?' מוצגים הנתונים התקינים האחרונים.':''))}finally{setBusy(false)}}
el('refresh').onclick=()=>update('/api/refresh',{symbol:el('symbolSelect').value});el('symbolSelect').onchange=load;
for(const button of document.querySelectorAll('[data-symbol]'))button.onclick=()=>choose(button.dataset.symbol);
el('importCSV').onclick=async()=>{const file=el('csvFile').files[0];if(!file)return error('בחר קובץ CSV.');if(file.size>900000)return error('קובץ CSV גדול מדי.');await update('/api/import',{symbol:el('symbolSelect').value,csv:await file.text(),source:el('csvSource').value})};
function applyCatalog(value){catalog=value.symbols;el('symbolSelect').replaceChildren();for(const item of value.ranking?.companies||catalog)option(item.symbol,item.name);renderRanking(value.ranking);}
el('importRanking').onclick=async()=>{if(busy)return;setBusy(true);try{const ranking=JSON.parse(el('ranking').value);await request('/api/ranking',ranking);applyCatalog(await request('/api/catalog'));el('rankingStatus').textContent='הדירוג נשמר מקומית; נכונות הנתונים לא אומתה.';analysis=null;render();setBusy(false);await load()}catch(err){el('rankingStatus').textContent=err.message}finally{setBusy(false)}};
for(const id of ['chartType','show20','show50','show100','show200','showBB'])el(id).onchange=draw;
el('range').onchange=()=>{count=Number(el('range').value);offset=0;draw()};
el('older').onclick=()=>{offset=Math.min(analysis.bars.length-Math.min(count,analysis.bars.length),offset+Math.max(1,Math.floor(count/2)));draw()};el('newer').onclick=()=>{offset=Math.max(0,offset-Math.max(1,Math.floor(count/2)));draw()};
el('priceChart').addEventListener('wheel',event=>{if(!analysis)return;event.preventDefault();count=Math.max(20,Math.min(analysis.bars.length,Math.round(count*(event.deltaY>0?1.2:.8))));offset=Math.min(offset,analysis.bars.length-count);draw()},{passive:false});
let lastWidth=0;new ResizeObserver(()=>{const width=Math.round(el('priceChart').clientWidth);if(width&&width!==lastWidth){lastWidth=width;draw()}}).observe(el('priceChart'));
function sourceLinks(id,urls){el(id).replaceChildren(...urls.map(url=>{const anchor=document.createElement('a');anchor.href=url;anchor.textContent=new URL(url).hostname;anchor.target='_blank';anchor.rel='noopener noreferrer';return anchor}));}
function financialNumber(metric){if(!Number.isFinite(metric?.value))return 'לא זמין';return metric.unit==='USD/share'?money(metric.value)+' USD למניה':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(metric.value);}
function renderFinancials(){
 el('financialContent').hidden=!financials;
 if(!financials){el('fundamentals').textContent='טרם נטענו נתונים כספיים למניה. לחיצה על שליפה תפנה למקורות חינמיים.';return;}
 const period=el('financialPeriod').value,group=financials[period],metrics=group?.metrics||{};
 el('fundamentals').textContent=financials.symbol+' · מקור: '+financials.source+' · נשלף: '+moment(financials.fetchedAt);
 el('financialProvenance').textContent='תקופה אחרונה: '+(group?.period||'לא נמסר')+' · הנתונים הכספיים נשמרים בנפרד מהניתוח הטכני. צפייה בגרף היסטורי אינה שחזור המידע הכספי שהיה ידוע אז.';
 const selected=Object.entries(metrics).filter(([key])=>period!=='trailing'||['TotalRevenue','NetIncome','DilutedEPS'].includes(key));
 el('financialRows').replaceChildren(...selected.map(([,item])=>tableRow([item.label,financialNumber(item),item.periodEnd?day(item.periodEnd):'לא נמסר',item.source||'לא זמין'])));
 const ratio=group?.derived||{};el('financialRatios').textContent='שולי רווח נקי: '+pct(ratio.netMarginPct)+' · שולי רווח תפעולי: '+pct(ratio.operatingMarginPct)+' · צמיחת הכנסות מול התקופה המקבילה: '+pct(ratio.revenueGrowthYoYPct);
 const valuation=financials.valuation||{};el('financialValuation').textContent=Number.isFinite(valuation.priceEarningsTTM)?'מכפיל רווח TTM: '+money(valuation.priceEarningsTTM)+' · סגירת מחיר: '+day(valuation.priceDate)+' · תקופת EPS: '+day(valuation.epsPeriodEnd):'מכפיל רווח TTM אינו זמין: נדרשים מחיר שמור ו־EPS TTM חיובי לתקופה האחרונה.';
 const age=Math.floor((Date.now()-Date.parse(financials.fetchedAt))/86400000);const warnings=[...(financials.warnings||[]),...(age>1?['העותק נשלף לפני יותר מיום; אפשר לעדכן מהמקורות.']:[])];el('financialWarnings').textContent=warnings.join(' · ');el('financialWarnings').hidden=!warnings.length;
 el('financialPeriodNote').textContent=financials.periodNote+' יתרות מאזן הן לסוף התקופה, ואינן סכום רבעוני. '+financials.filingDateNote+' המקורות ציבוריים; אין אימות חשבונאי עצמאי.';
 sourceLinks('financialSources',financials.sourceUrls||[]);
}
function renderRanking(ranking){
 if(!ranking)return;
 const automatic=ranking.verification==='two-source-membership-and-order-checked';
 el('catalogHeading').textContent=automatic?'TOP 20 · דירוג אוטומטי':'TOP 20 — דירוג מיובא';
 el('rankingNote').textContent=automatic?'נשלף: '+moment(ranking.fetchedAt)+' · הרכב וסדר הוצלבו מול מקור נוסף. מועד שווי השוק עצמו לא נמסר.':'מועד דירוג: '+moment(ranking.asOf)+' · מקור: '+ranking.source+' · לא אומת עצמאית.';
 el('autoRankingStatus').textContent=automatic?'20 חברות אמריקאיות, חברה אחת לכל סוגי המניות. סדר והרכב נבדקו בשני אתרים. נשלף: '+moment(ranking.fetchedAt):'מוצג דירוג שיובא ידנית; לא נשלף ולא אומת אוטומטית.';
 const differences=ranking.discrepancies||[];el('rankingWarnings').textContent=differences.length?'פערי שווי מעל 1% בין המקורות: '+differences.map(row=>row.symbol+' '+(row.relativeDifference*100).toFixed(2)+'%').join(', ')+'. מוצגים שני הערכים; אין אישור לשווי מדויק.':'';el('rankingWarnings').hidden=!differences.length;
 el('autoRankingRows').replaceChildren(...ranking.companies.map((item,index)=>{const row=tableRow([String(index+1),'',item.name,financialNumber({value:item.marketCap,unit:'USD'}),financialNumber({value:item.comparisonMarketCap,unit:'USD'}),Number.isFinite(item.relativeDifference)?(item.relativeDifference*100).toFixed(2)+'%':'לא נבדק']);const button=document.createElement('button');button.textContent=item.symbol;button.onclick=()=>choose(item.symbol,item.name);row.cells[1].append(button);return row}));
 const samples=(ranking.priceSpotChecks||[]).map(item=>item.symbol+': '+day(item.dailyPriceDate)+(item.matchesWithin1Percent?' תואם למחיר יומי שמור':' אינו תואם למחיר יומי שמור')).join('; ');
 el('rankingFreshness').textContent=(ranking.freshnessNote||'מועד נתוני הדירוג הוא כפי שסופק בייבוא.')+(samples?' בדיקה מדגמית: '+samples+'.':'')+' '+(ranking.warning||'');
 sourceLinks('rankingSources',ranking.sources||[ranking.source]);
}
el('financialPeriod').onchange=renderFinancials;
el('refreshFundamentals').onclick=async()=>{if(busy)return;setBusy(true);error('');try{const data=await request('/api/fundamentals/refresh',{symbol:el('symbolSelect').value});financials=data.fundamentals;renderFinancials();await loadScreening()}catch(err){error(err.message+(financials?' מוצגים הנתונים הכספיים השמורים.':''))}finally{setBusy(false)}};
el('refreshRanking').onclick=async()=>{if(busy)return;const selected=el('symbolSelect').value;setBusy(true);error('');try{await request('/api/ranking/refresh',{});applyCatalog(await request('/api/catalog'));if([...el('symbolSelect').options].some(item=>item.value===selected))el('symbolSelect').value=selected;setBusy(false);await load()}catch(err){error(err.message)}finally{setBusy(false)}};
async function loadScreening(){screening=await request('/api/top20/comparison');const symbols=new Set(screening.items.map(item=>item.symbol));for(const symbol of compared)if(!symbols.has(symbol))compared.delete(symbol);renderScreening()}
function renderScreening(){
 if(!screening)return;
 el('screeningCoverage').textContent='כיסוי טכני: '+screening.technicalCoverage+'/'+screening.total+' · פונדמנטלי: '+screening.fundamentalCoverage+'/'+screening.total+' · מדורגות לאותו יום: '+screening.ranked+'/'+screening.total+(screening.referenceDate?' · יום השוואה: '+day(screening.referenceDate):'')+(screening.total?'':' · עדכן קודם את דירוג שווי השוק.')+(screening.rankingVerification==='manual-import-not-independently-verified'?' · רשימת החברות יובאה ידנית ולא אומתה.':'');
 el('screeningMethod').textContent=screening.method;
 const sort=el('screeningSort').value,filter=el('screeningFilter').value;
 const rows=screening.items.filter(item=>filter==='all'||(filter==='complete'?item.rank!==null:item.rank===null));
 rows.sort((a,b)=>sort==='symbol'?a.symbol.localeCompare(b.symbol):sort==='rank'?(a.rank??Infinity)-(b.rank??Infinity)||a.symbol.localeCompare(b.symbol):(b[sort]??-Infinity)-(a[sort]??-Infinity)||a.symbol.localeCompare(b.symbol));
 el('screeningRows').replaceChildren(...rows.map(item=>{
  const row=tableRow(['',item.rank??'—','',item.technicalScore??'לא זמין',item.fundamentalScore??'לא זמין',item.combinedScore??'לא זמין',item.dataDate?day(item.dataDate):'לא זמין',item.financialPeriod||'לא זמין','']);
  const check=document.createElement('input');check.type='checkbox';check.checked=compared.has(item.symbol);check.setAttribute('aria-label','השווה '+item.symbol);check.onchange=()=>{if(check.checked&&compared.size>=4){check.checked=false;el('screeningStatus').textContent='אפשר לבחור עד 4 חברות. בטל בחירה כדי להוסיף אחרת.';return}check.checked?compared.add(item.symbol):compared.delete(item.symbol);el('screeningStatus').textContent='נבחרו '+compared.size+' מתוך 4 חברות.';renderScreeningDetails()};row.cells[0].append(check);
  const button=document.createElement('button');button.textContent=item.symbol+' · '+item.name;button.disabled=busy;button.onclick=()=>choose(item.symbol,item.name);row.cells[2].append(button);
  const detail=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent=item.warnings.length?item.warnings.length+' הערות':'נתונים זמינים';text.textContent=[...item.warnings,'מקור מחירים: '+(item.priceSource||'לא זמין'),'דוחות נשלפו: '+(item.financialFetchedAt?moment(item.financialFetchedAt):'לא זמין')].join(' · ');detail.append(summary,text);row.cells[8].append(detail);return row;
 }));renderScreeningDetails();
}
function renderScreeningDetails(){
 const items=screening.items.filter(item=>compared.has(item.symbol));el('screeningDetails').replaceChildren();if(!items.length)return;
 const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody');head.append(tableRow(['נתון',...items.map(item=>item.symbol)]));
 const fields=[['מקום','rank'],['ציון טכני','technicalScore'],['ציון פונדמנטלי','fundamentalScore'],['ציון משולב','combinedScore'],['יום מחיר','dataDate'],['תקופת דוח שנתי','financialPeriod']];
 for(const [label,key] of fields)body.append(tableRow([label,...items.map(item=>item[key]??'לא זמין')]));
 for(const [key,label] of [['netMarginPct','שולי רווח נקי %'],['operatingMarginPct','שולי רווח תפעולי %'],['revenueGrowthYoYPct','צמיחת הכנסות %'],['freeCashFlowMarginPct','תזרים חופשי/הכנסות %'],['debtToEquity','חוב/הון']])body.append(tableRow([label,...items.map(item=>{const component=item.components.find(part=>part.key===key);return component?.value!==null&&component?.value!==undefined?money(component.value)+' · '+money(component.points)+'/20':'לא זמין'})]));
 body.append(tableRow(['הערות',...items.map(item=>item.warnings.join(' · ')||'אין הערות')]));table.append(head,body);el('screeningDetails').append(table);
}
el('screeningSort').onchange=renderScreening;el('screeningFilter').onchange=renderScreening;
el('reloadScreening').onclick=async()=>{try{await loadScreening()}catch(err){error(err.message)}};
try{applyCatalog(await request('/api/catalog'));if([...el('symbolSelect').options].some(item=>item.value==='NVDA'))el('symbolSelect').value='NVDA';await load()}catch(err){error('השרת המקומי אינו זמין: '+err.message)}

