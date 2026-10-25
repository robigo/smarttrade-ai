// Simulated portfolio valuation, independent of market-data provider.
import {assessPortfolioRisk} from './portfolio-risk.mjs';
export function valuePaperPortfolio(portfolio,prices){
 const risk=assessPortfolioRisk(portfolio,prices,{maxPositionPct:100,maxGrossExposurePct:100});
 if(!risk.valid)return {valid:false,reason:risk.reason};
 const holdings=risk.positions.map(p=>({symbol:p.symbol,valueCents:p.valueCents,weightPct:p.weightPct}));
 return {valid:true,totalCents:risk.totalCents,cashCents:portfolio.cashCents,investedCents:risk.investedCents,holdings};
}
