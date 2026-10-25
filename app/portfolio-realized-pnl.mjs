// Offline realized P&L for paper trades. FIFO cost basis, integer shares/cents.
// This module does not request market data or place brokerage orders.
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const symbol=s=>typeof s==='string'&&/^[A-Z][A-Z0-9.]{0,9}$/.test(s);
export function calculateRealizedPnl(trades) {
 const deny=reason=>({valid:false,reason});
 if(!Array.isArray(trades))return deny('invalid_trades');
 const lots=new Map();
 let realizedCents=0;
 for(const trade of trades) {
  if(!trade||!symbol(trade.symbol)||!['buy','sell'].includes(trade.side)||
      !Number.isSafeInteger(trade.quantity)||trade.quantity<=0||
      !Number.isSafeInteger(trade.priceCents)||trade.priceCents<=0)
   return deny('invalid_trade');
  const total=trade.quantity*trade.priceCents;
  if(!integer(total))return deny('amount_overflow');
  const positions=lots.get(trade.symbol)||[];
  if(trade.side==='buy'){
   positions.push({remaining:trade.quantity,priceCents:trade.priceCents});
  }else{
   const available=positions.reduce((n,l)=>n+l.remaining,0);
   if(!integer(available)||available<trade.quantity)return deny('insufficient_units');
   let remaining=trade.quantity;
   while(remaining>0){
    const lot=positions[0];
    const take=Math.min(remaining,lot.remaining);
    const delta=take*(trade.priceCents-lot.priceCents);
    if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(realizedCents+delta))return deny('amount_overflow');
    realizedCents+=delta;
    lot.remaining-=take;
    remaining-=take;
    if(lot.remaining===0)positions.shift();
   }
  }
  lots.set(trade.symbol,positions);
 }
 const remainingPositions=Object.fromEntries(
  [...lots.entries()].map(([key,entries])=>[key,entries.reduce((n,l)=>n+l.remaining,0)]).filter(([,n])=>n>0)
 );
 return {valid:true,realizedCents,remainingPositions};
}
