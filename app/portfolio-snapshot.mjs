// Strict validation of imported or restored simulated portfolio snapshots.
// Reject corrupt data before valuation or trade execution.
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const symbol=s=>typeof s==='string'&&/^[A-Z][A-Z0-9.]{0,9}$/.test(s);
export function validatePortfolioSnapshot(snapshot){
 const deny=reason=>({valid:false,reason});
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||!safe(snapshot.cashCents))return deny('invalid_cash');
 if(!snapshot.positions||typeof snapshot.positions!=='object'||Array.isArray(snapshot.positions))return deny('invalid_positions');
 if(!Array.isArray(snapshot.trades))return deny('invalid_trades');
 for(const [key,quantity] of Object.entries(snapshot.positions)){
  if(!symbol(key)||!safe(quantity))return deny('invalid_position');
 }
 for(const trade of snapshot.trades){
  if(!trade||typeof trade!=='object'||!symbol(trade.symbol)||!['buy','sell'].includes(trade.side)||
     !Number.isSafeInteger(trade.quantity)||trade.quantity<=0||
     !Number.isSafeInteger(trade.priceCents)||trade.priceCents<=0)return deny('invalid_trade');
 }
 return {valid:true};
}
