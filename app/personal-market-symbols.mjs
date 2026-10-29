// Curated US listings for private learning; provider entitlement is still checked.
export const PERSONAL_MARKET_INSTRUMENTS=Object.freeze([
 ['AAPL','Apple'],['MSFT','Microsoft'],['NVDA','NVIDIA'],
 ['AMZN','Amazon'],['GOOGL','Alphabet'],['META','Meta'],
 ['TSLA','Tesla'],['AMD','AMD'],['INTC','Intel'],['NFLX','Netflix'],
 ['SPY','SPDR S&P 500 ETF'],['QQQ','Invesco QQQ ETF'],
].map(([symbol,name])=>Object.freeze({symbol,name,currency:'USD'})));
export const PERSONAL_SYMBOLS=Object.freeze(PERSONAL_MARKET_INSTRUMENTS.map(item=>item.symbol));
