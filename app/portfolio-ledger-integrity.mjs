// Verify paper portfolio integrity by replaying its complete trade history.
// Designed as a fail-closed guard before any future account-backed persistence.
import {initialPortfolio,executePaperTrade} from './portfolio-engine.mjs';
import {validatePortfolioSnapshot} from './portfolio-snapshot.mjs';

export function validatePortfolioLedger(snapshot){
 const reject=reason=>({valid:false,reason});
 const shape=validatePortfolioSnapshot(snapshot);
 if(!shape.valid)return reject(shape.reason);
 if(snapshot.trades.length>10000)return reject('too_many_trades');
 const normalized=Object.create(null);
 for(const [symbol,qty] of Object.entries(snapshot.positions)){
  if(qty===0)return reject('noncanonical_position');
  normalized[symbol]=qty;
 }
 let result=initialPortfolio();
 for(const trade of snapshot.trades){
  // No trust in stored totals or positions: replay each execution against
  // cash and holdings in order. This blocks oversells and impossible cash.
  const step=executePaperTrade(result,trade);
  if(!step.accepted)return reject('invalid_trade_history');
  result=step.portfolio;
 }
 if(result.cashCents!==snapshot.cashCents)return reject('cash_mismatch');
 const expected=Object.entries(result.positions);
 const observed=Object.entries(normalized);
 if(expected.length!==observed.length)return reject('positions_mismatch');
 for(const [symbol,qty] of expected){
  if(!Object.hasOwn(normalized,symbol)||normalized[symbol]!==qty)return reject('positions_mismatch');
 }
 return {valid:true};
}
