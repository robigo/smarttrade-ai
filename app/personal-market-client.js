// Manual requests only. No provider key, polling or portfolio mutation.
(()=>{
 const el=id=>document.getElementById(id);
 el('authState').textContent='שליפת נתונים פרטית ללמידה עצמית בלבד. נדרשת התחברות Google.';
 el('liveQuoteButton').textContent='שלוף מחיר ללמידה';
 const button=el('liveQuoteButton'),output=el('liveQuoteResult');
 const watchPrices=new Map();let busy=false,loadingSymbol=null;
 function updateWatchRows(){
  const allowed=new Set([...el('liveSymbol').options].map(option=>option.value));
  for(const row of el('watchRows').rows){
   const symbol=row.cells[0]?.textContent.trim();if(!allowed.has(symbol)||row.cells.length<3)continue;
   const cell=row.cells[1],record=watchPrices.get(symbol);cell.replaceChildren();cell.setAttribute('aria-live','polite');
   if(record?.data){
    const price=document.createElement('span');price.textContent=record.data.price+' '+record.data.currency;cell.append(price);
    const time=document.createElement('small');time.style.display='block';const date=new Date(record.data.receivedAt);time.textContent='Twelve Data · נשלף: '+(Number.isFinite(date.getTime())?date.toLocaleTimeString('he-IL'):'לא ידוע');cell.append(time);
   }else if(!record?.error)cell.textContent=busy&&loadingSymbol===symbol?'שולף...':'טרם נשלף';
   if(record?.error){const error=document.createElement('small');error.style.display='block';error.textContent=record.error;cell.append(error);}
   let fetchButton=row.cells[2].querySelector('[data-personal-quote]');
   if(!fetchButton){fetchButton=document.createElement('button');fetchButton.dataset.personalQuote=symbol;fetchButton.setAttribute('aria-label','שלוף מחיר עבור '+symbol);fetchButton.onclick=()=>{el('liveSymbol').value=symbol;fetchQuote(symbol)};row.cells[2].prepend(fetchButton);}
   fetchButton.textContent=busy&&loadingSymbol===symbol?'שולף...':'שלוף מחיר';fetchButton.disabled=busy;
  }
 }
 function setBusy(value){busy=value;button.disabled=value;updateWatchRows();}
 function showFailure(symbol,message){watchPrices.set(symbol,{...watchPrices.get(symbol),error:message});output.textContent=message;updateWatchRows();}
 const messages={market_display_disabled:'שליפת נתונים עדיין כבויה.',provider_access_denied:'הספק דחה את הגישה. יש לבדוק את המפתח ואת הרשאת המסלול לסימול.',provider_key_invalid:'Twelve Data דחה את מפתח ה־API (401). יש לעדכן את המפתח בהגדרות השרת; אין לשלוח אותו בצ׳אט.',provider_plan_restricted:'Twelve Data חסם את הבקשה במסגרת הרשאות החשבון או הסימול (403). לא בוצע שדרוג מנוי.',provider_not_configured:'חיבור הספק אינו מוגדר.',quota_guard_unavailable:'בקרת המכסה אינה זמינה. לא נשלחה בקשה לספק.',unsupported_symbol:'הסימול אינו נתמך בשלב זה.',invalid_provider_response:'הספק החזיר נתון שלא ניתן לאמת.',provider_unavailable:'הספק אינו זמין כרגע.'};
 async function fetchQuote(symbol){
  if(busy)return;
  loadingSymbol=symbol;if(watchPrices.has(symbol))watchPrices.set(symbol,{data:watchPrices.get(symbol).data});
  setBusy(true);output.textContent='שולף נתון ללמידה...';
  try{
   const r=await fetch('/api/market/quote?symbol='+encodeURIComponent(symbol),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
   const data=await r.json();
   if(r.status===401){watchPrices.clear();showFailure(symbol,'יש להתחבר באמצעות Google.');return}
   if(r.status===429){showFailure(symbol,'הגעת למכסת הבקשות. '+(data.retryAfterSeconds?'אפשר לנסות שוב בעוד '+data.retryAfterSeconds+' שניות.':'נסה שוב מאוחר יותר.'));return}
   if(!r.ok){showFailure(symbol,(data.error==='provider_timeout'?'הספק לא השיב בזמן.':data.error==='provider_connection_failed'?'החיבור לספק נכשל.':data.error==='provider_redirect_rejected'?'הספק החזיר כתובת לא צפויה. הבקשה נעצרה.':messages[data.error]||'לא ניתן לקבל מחיר כרגע ('+r.status+').')+(Number.isSafeInteger(data.providerCode)?' קוד ספק: '+data.providerCode+'.':''));return}
   if(data.symbol!==symbol||data.currency!=='USD'||!Number.isFinite(data.price)||data.price<=0){showFailure(symbol,'הספק החזיר נתון שלא ניתן לאמת.');return}
   watchPrices.set(symbol,{data});updateWatchRows();
   output.textContent=data.symbol+': '+data.price+' '+data.currency+' · מקור: Twelve Data · מועד הספק: '+(data.providerTime||'לא נמסר')+' · נשלף: '+new Date(data.receivedAt).toLocaleString('he-IL')+' · ללמידה בלבד; אינו משנה את תיק הסימולציה.';
  }catch{showFailure(symbol,'לא ניתן לקבל מחיר כרגע.')}
  finally{loadingSymbol=null;setBusy(false)}
 }
 button.onclick=()=>fetchQuote(el('liveSymbol').value);
 // Observe row additions/removals only; updating cells never triggers this observer.
 new MutationObserver(updateWatchRows).observe(el('watchRows'),{childList:true});
 updateWatchRows();
 el('marketAccessCheck').onclick=async()=>{
  const output=el('marketAccessStatus');output.textContent='בודק גישה...';
  try{
   const r=await fetch('/api/market/status',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(r.status===401){output.textContent='נדרשת התחברות Google.';return}
   if(!r.ok){output.textContent='בדיקת הגישה נכשלה.';return}
   const data=await r.json();output.textContent=data.quotesEnabled?'שליפה ידנית ללמידה עצמית פעילה · עד 8 קרדיטים בדקה ו־800 ביום דרך כלי זה.':'שליפת נתונים כבויה או שחיבור הספק אינו מוכן.';
  }catch{output.textContent='לא ניתן לבדוק גישה כרגע.'}
 };
})();
