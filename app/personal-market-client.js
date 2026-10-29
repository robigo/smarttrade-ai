// Manual requests only. No provider key, polling or portfolio mutation.
(()=>{
 const el=id=>document.getElementById(id);
 el('authState').textContent='שליפת נתונים פרטית ללמידה עצמית בלבד. נדרשת התחברות Google.';
 el('liveQuoteButton').textContent='שלוף מחיר ללמידה';
 const button=el('liveQuoteButton'),output=el('liveQuoteResult');
 const messages={market_display_disabled:'שליפת נתונים עדיין כבויה.',provider_access_denied:'הספק דחה את הגישה. יש לבדוק את המפתח ואת הרשאת המסלול לסימול.',provider_key_invalid:'Twelve Data דחה את מפתח ה־API (401). יש לעדכן את המפתח בהגדרות השרת; אין לשלוח אותו בצ׳אט.',provider_plan_restricted:'Twelve Data חסם את הבקשה במסגרת הרשאות החשבון או הסימול (403). לא בוצע שדרוג מנוי.',provider_not_configured:'חיבור הספק אינו מוגדר.',quota_guard_unavailable:'בקרת המכסה אינה זמינה. לא נשלחה בקשה לספק.',unsupported_symbol:'הסימול אינו נתמך בשלב זה.',invalid_provider_response:'הספק החזיר נתון שלא ניתן לאמת.',provider_unavailable:'הספק אינו זמין כרגע.'};
 button.onclick=async()=>{
  button.disabled=true;output.textContent='שולף נתון ללמידה...';
  try{
   const r=await fetch('/api/market/quote?symbol='+encodeURIComponent(el('liveSymbol').value),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
   const data=await r.json();
   if(r.status===401){output.textContent='יש להתחבר באמצעות Google.';return}
   if(r.status===429){output.textContent='הגעת למכסת הבקשות. '+(data.retryAfterSeconds?'אפשר לנסות שוב בעוד '+data.retryAfterSeconds+' שניות.':'נסה שוב מאוחר יותר.');return}
   if(!r.ok){output.textContent=(data.error==='provider_timeout'?'הספק לא השיב בזמן.':data.error==='provider_connection_failed'?'החיבור לספק נכשל.':data.error==='provider_redirect_rejected'?'הספק החזיר כתובת לא צפויה. הבקשה נעצרה.':messages[data.error]||'לא ניתן לקבל מחיר כרגע ('+r.status+').')+(Number.isSafeInteger(data.providerCode)?' קוד ספק: '+data.providerCode+'.':'');return}
   output.textContent=data.symbol+': '+data.price+' '+data.currency+' · מקור: Twelve Data · מועד הספק: '+(data.providerTime||'לא נמסר')+' · נשלף: '+new Date(data.receivedAt).toLocaleString('he-IL')+' · ללמידה בלבד; אינו משנה את תיק הסימולציה.';
  }catch{output.textContent='לא ניתן לקבל מחיר כרגע.'}
  finally{button.disabled=false}
 };
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
