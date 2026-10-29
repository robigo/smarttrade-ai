// Account drafts live in memory. Local paper portfolios are never replaced.
// MODEL START
function accountTrade(snapshot, order) {
  if (!order || typeof order.symbol!=='string' || !/^[A-Z][A-Z0-9.]{0,9}$/.test(order.symbol) ||
      !['buy','sell'].includes(order.side) || !Number.isSafeInteger(order.quantity) || order.quantity <= 0 ||
      !Number.isSafeInteger(order.priceCents) || order.priceCents <= 0) throw Error('פקודת עסקה לא תקינה');
  const cost = order.quantity * order.priceCents;
  const current = Object.hasOwn(snapshot.positions, order.symbol) ? snapshot.positions[order.symbol] : 0;
  if (!Number.isSafeInteger(cost)) throw Error('סכום גדול מדי');
  if (order.side === 'buy' && cost > snapshot.cashCents) throw Error('אין מספיק מזומן');
  if (order.side === 'sell' && current < order.quantity) throw Error('אין מספיק יחידות');
  const positions = {...snapshot.positions};
  const quantity = current + (order.side === 'buy' ? order.quantity : -order.quantity);
  if (quantity) positions[order.symbol] = quantity; else delete positions[order.symbol];
  const cashCents = snapshot.cashCents + (order.side === 'buy' ? -cost : cost);
  if (!Number.isSafeInteger(cashCents) || !Number.isSafeInteger(quantity) || snapshot.trades.length >= 10000) throw Error('התיק חורג מהמגבלות');
  return {cashCents, positions, trades:[...snapshot.trades, {...order}]};
}
function accountValidateSnapshot(snapshot) {
  if (!snapshot || !Number.isSafeInteger(snapshot.cashCents) || snapshot.cashCents < 0 ||
      !snapshot.positions || typeof snapshot.positions !== 'object' || Array.isArray(snapshot.positions) ||
      !Array.isArray(snapshot.trades) || snapshot.trades.length > 10000) throw Error('תיק חשבון לא תקין');
  let replay = {cashCents:1500000,positions:{},trades:[]};
  for (const trade of snapshot.trades) replay = accountTrade(replay, trade);
  if (replay.cashCents !== snapshot.cashCents || Object.keys(replay.positions).length !== Object.keys(snapshot.positions).length ||
      Object.entries(replay.positions).some(([symbol, qty]) => !Object.hasOwn(snapshot.positions, symbol) || snapshot.positions[symbol] !== qty)) throw Error('נתוני התיק אינם תואמים להיסטוריה');
  return replay;
}
function accountFromLegacy(legacy, allowedSymbols) {
  const cents = n => {
    const v = n * 100;
    if (!Number.isFinite(v) || !Number.isSafeInteger(Math.round(v)) || Math.abs(v-Math.round(v)) > 1e-6) throw Error('לא ניתן להעביר סכום עם שברי אגורה');
    return Math.round(v);
  };
  if (!legacy || !Array.isArray(legacy.trades) || !legacy.units || legacy.trades.length > 10000) throw Error('תיק מקומי לא תקין');
  const positions = {};
  for (const [symbol,qty] of Object.entries(legacy.units)) {
    if (!allowedSymbols.includes(symbol) || !Number.isSafeInteger(qty) || qty < 0) throw Error('העברה תומכת ביחידות שלמות בלבד; התיק המקומי נשמר');
    if (qty) positions[symbol] = qty;
  }
  const trades = legacy.trades.map(t => {
    if (!t || !allowedSymbols.includes(t.id) || !Number.isSafeInteger(t.qty) || t.qty <= 0) throw Error('העברה תומכת ביחידות שלמות בלבד; התיק המקומי נשמר');
    const total = cents(t.sum);
    if (total % t.qty !== 0) throw Error('לא ניתן להעביר מחיר עם שברי אגורה');
    return {symbol:t.id,side:t.side,quantity:t.qty,priceCents:total/t.qty};
  });
  return accountValidateSnapshot({cashCents:cents(legacy.cash),positions,trades});
}
// MODEL END

(() => {
  const el = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(cents/100);
  let identity = null, epoch = 0, doc = null, busy = false, dirty = false, conflict = false;
  let authSequence = 0;
  const status = message => { el('accountStatus').textContent = message; };
  function render() {
    el('accountIdentity').textContent = identity ? 'חשבון: '+identity.email : 'יש להתחבר באמצעות Google כדי לטעון תיק חשבון.';
    for (const id of ['accountLoad','accountTrade','accountSave','accountImport','accountExport']) el(id).disabled = busy || !identity || (id !== 'accountLoad' && !doc) || (conflict && ['accountTrade','accountSave','accountImport'].includes(id));
    if (!doc) { el('accountCash').textContent=''; el('accountHoldings').replaceChildren(); return; }
    el('accountCash').textContent = 'מזומן בחשבון: '+money(doc.snapshot.cashCents)+(dirty?' · שינויים שטרם נשמרו':' · ללא שינויים ממתינים');
    el('accountHoldings').replaceChildren();
    for (const [symbol,quantity] of Object.entries(doc.snapshot.positions)) {
      const row=document.createElement('tr');
      for (const value of [symbol,quantity]) {const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
      el('accountHoldings').append(row);
    }
  }
  function setIdentity(data) {
    const next = data?.authenticated && typeof data.accountId==='string' && data.accountId && typeof data.email==='string' ? {id:data.accountId,email:data.email} : null;
    if (identity?.id !== next?.id) {
      epoch++; doc=null;dirty=false;conflict=false;busy=false;
      status(next?'ההתחברות אומתה. ניתן לטעון את תיק החשבון.':'לא מחובר; טיוטת החשבון נסגרה. התיק המקומי נשמר.');
    }
    identity=next;render();
  }
  async function checkIdentity() {
    const sequence=++authSequence;
    try {
      const response=await fetch('/auth/me',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const data=await response.json();
      if(sequence!==authSequence)return false;
      setIdentity(response.ok?data:null);
      return !!identity;
    } catch {if(sequence===authSequence)status('לא ניתן לאמת התחברות כרגע; הטיוטה נשארה בזיכרון. יש לבדוק התחברות שוב.');return false;}
  }
  async function action(run) {
    if(busy || !identity)return;
    const generation=epoch, accountId=identity.id;
    busy=true;render();
    try {
      const response=await fetch('/auth/me',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const auth=await response.json();
      if(epoch!==generation)return;
      if(!response.ok || auth.accountId!==accountId || !auth.authenticated){setIdentity(response.ok?auth:null);throw Error('החשבון השתנה או שההתחברות פגה. יש לטעון את התיק מחדש.');}
      await run(generation,accountId);
    } catch(error) {if(epoch===generation || !doc)status(['TypeError','TimeoutError','AbortError'].includes(error.name)?'לא ניתן ליצור קשר עם השרת. הטיוטה לא נשמרה; ניתן לנסות שוב.':error.message || 'הפעולה נכשלה; לא נדרסו נתונים.');}
    finally {if(epoch===generation){busy=false;render();}}
  }
  async function readResponse(response) {
    let data;try{data=await response.json();}catch{throw Error('תגובת שרת לא תקינה');}
    if(response.status===401){setIdentity(null);throw Error('ההתחברות פגה; יש להתחבר שוב.');}
    if(response.status===503)throw Error('שמירת חשבונות עדיין אינה זמינה. התיק המקומי נשמר ללא שינוי.');
    if(response.status===409){conflict=true;throw Error('קיימת גרסה חדשה יותר בחשבון. ניתן לייצא את הטיוטה לפני טעינה מחדש.');}
    if(response.status===403 && data.error==='account_changed'){setIdentity(null);throw Error('החשבון השתנה. יש להתחבר ולטעון מחדש.');}
    if(!response.ok)throw Error('הפעולה נכשלה (HTTP '+response.status+'); ניתן לנסות שוב.');
    return data;
  }
  el('accountLoad').onclick=()=>{
    if(dirty && !confirm('לטעון מחדש ולהחליף את טיוטת החשבון שלא נשמרה? ניתן לבטל ולייצא אותה קודם.'))return;
    return action(async(generation,accountId)=>{
      const response=await fetch('/api/private/portfolio',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(epoch!==generation)return;
      const data=await readResponse(response);
      if(epoch!==generation)return;
      if(data.accountId!==accountId || !Number.isSafeInteger(data.version) || data.version<0)throw Error('תשובת החשבון אינה תואמת למשתמש');
      const snapshot=accountValidateSnapshot(data.snapshot);
      doc={version:data.version,snapshot};dirty=false;conflict=false;
      status('תיק החשבון נטען. הפעולות כאן הן סימולציה בלבד.');
    });
  };
  el('accountSave').onclick=()=>action(async(generation,accountId)=>{
    if(!doc || conflict)return;
    const snapshot=accountValidateSnapshot(doc.snapshot), version=doc.version;
    const response=await fetch('/api/private/portfolio',{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','X-Account-Id':accountId},body:JSON.stringify({version,snapshot}),signal:AbortSignal.timeout(10000)});
    if(epoch!==generation)return;
    const data=await readResponse(response);
    if(epoch!==generation)return;
    if(data.version!==version+1){conflict=true;throw Error('גרסת השמירה לא אומתה; יש לטעון מחדש לפני שמירה נוספת');}
    doc={version:data.version,snapshot};dirty=false;status('תיק החשבון נשמר בהצלחה.');
  });
  el('accountTrade').onclick=()=>{
    if(!doc || busy || conflict)return;
    try{
      const symbol=el('accountAsset').value;
      const asset=A.find(a=>a.id===symbol);
      const value=asset?.price*100;
      if(!Number.isFinite(value) || Math.abs(value-Math.round(value))>1e-6)throw Error('מחיר ההדגמה אינו תקין לתיק החשבון');
      doc.snapshot=accountTrade(doc.snapshot,{symbol,side:el('accountSide').value,quantity:Number(el('accountQty').value),priceCents:Math.round(value)});
      dirty=true;status('העסקה נוספה לטיוטה. יש לשמור כדי לעדכן את החשבון.');render();
    }catch(error){status(error.message);}
  };
  el('accountImport').onclick=()=>{
    if(!doc || busy || conflict)return;
    try{
      const snapshot=accountFromLegacy(state,A.map(a=>a.id));
      if(!confirm('להעתיק את התיק המקומי לטיוטת החשבון? התיק המקומי יישאר, והשמירה לחשבון תתבצע רק בלחיצה על שמירה.'))return;
      doc.snapshot=snapshot;dirty=true;status('התיק המקומי הועתק לטיוטה בלבד. יש לשמור כדי לעדכן את החשבון.');render();
    }catch(error){status(error.message);}
  };
  el('accountExport').onclick=()=>{if(doc)download('account-draft.json',JSON.stringify({format:'smarttrade-account-v1',version:doc.version,snapshot:doc.snapshot},null,2),'application/json');};
  for(const asset of A){const option=document.createElement('option');option.value=asset.id;option.textContent=asset.name;el('accountAsset').append(option);}
  // Close the private draft before leaving for login/logout. Server guards
  // still enforce the session account if another tab changes the cookie.
  for(const id of ['googleLogin','googleLogout'])el(id).addEventListener('click',()=>setIdentity(null));
  el('checkLogin').addEventListener('click',checkIdentity);
  addEventListener('focus',()=>{if(identity)checkIdentity();});
  addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  render();checkIdentity();
})();
