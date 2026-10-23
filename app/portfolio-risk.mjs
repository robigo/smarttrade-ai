// Pure, deterministic risk calculations for simulated portfolios only.
// No broker orders, provider requests or investment recommendations.
const safe=n=>Number.isSafeInteger(n)&&n>=0;
export function assessPortfolioRisk(portfolio,prices,{maxPositionPct=25,maxGrossExposurePct=80}={}){
 const invalid=reason=>({valid:false,reason});
 if(!portfolio||!safe(portfolio.cashCents)||!portfolio.positions||typeof portfolio.positions!=='object'||Array.isArray(portfolio.positions))return invalid('invalid_portfolio');
 if(!prices||typeof prices!=='object'||Array.isArray(prices))return invalid('invalid_prices');
 if(!Number.isFinite(maxPositionPct)||maxPositionPct<=0||maxPositionPct>100||!Number.isFinite(maxGrossExposurePct)||maxGrossExposurePct<=0||maxGrossExposurePct>100)return invalid('invalid_limits');
 let invested=0;
 const positions=[];
 for(const [symbol,units] of Object.entries(portfolio.positions)){
  if(!safe(units)||!safe(prices[symbol])||prices[symbol]===0)return invalid('missing_or_invalid_price');
  const value=units*prices[symbol];
  if(!safe(value))return invalid('amount_overflow');
  invested+=value;
  if(!safe(invested))return invalid('amount_overflow');
  positions.push({symbol,valueCents:value});
 }
 const total=portfolio.cashCents+invested;
 if(!safe(total)||total===0)return invalid('invalid_total');
 const exposurePct=invested/total*100;
 const detail=positions.map(p=>({...p,weightPct:p.valueCents/total*100,overLimit:p.valueCents/total*100>maxPositionPct}));
 return {valid:true,totalCents:total,investedCents:invested,exposurePct,overExposureLimit:exposurePct>maxGrossExposurePct,positions:detail};
}
