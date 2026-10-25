// Deterministic paper-portfolio engine. No broker connectivity or paid APIs.
export const STARTING_CASH_CENTS = 1500000;
const validCents=n=>Number.isSafeInteger(n)&&n>=0;
const validQty=n=>Number.isSafeInteger(n)&&n>0;
const validSymbol=s=>typeof s==='string'&&/^[A-Z][A-Z0-9.]{0,9}$/.test(s);
export function initialPortfolio(){
 return {cashCents:STARTING_CASH_CENTS,positions:{},trades:[]};
}
export function executePaperTrade(portfolio,order){
 const reject=reason=>({accepted:false,reason});
 if(!portfolio||!validCents(portfolio.cashCents)||!portfolio.positions||
    typeof portfolio.positions!=='object'||Array.isArray(portfolio.positions)||
    !Array.isArray(portfolio.trades))return reject('invalid_portfolio');
 if(!order||!validSymbol(order.symbol)||!['buy','sell'].includes(order.side)||
    !validQty(order.quantity)||!validQty(order.priceCents))return reject('invalid_order');
 const cost=order.quantity*order.priceCents;
 if(!Number.isSafeInteger(cost))return reject('amount_overflow');
 const current=portfolio.positions[order.symbol]??0;
 if(!validCents(current))return reject('invalid_position');
 if(order.side==='buy'&&portfolio.cashCents<cost)return reject('insufficient_cash');
 if(order.side==='sell'&&current<order.quantity)return reject('insufficient_units');
 const nextCash=portfolio.cashCents+(order.side==='buy'? -cost:cost);
 const nextUnits=current+(order.side==='buy'?order.quantity:-order.quantity);
 if(!validCents(nextCash)||!validCents(nextUnits))return reject('amount_overflow');
 const positions={...portfolio.positions};
 if(nextUnits===0)delete positions[order.symbol];else positions[order.symbol]=nextUnits;
 const trade={symbol:order.symbol,side:order.side,quantity:order.quantity,priceCents:order.priceCents};
 return {accepted:true,portfolio:{cashCents:nextCash,positions,trades:[...portfolio.trades,trade]}};
}
