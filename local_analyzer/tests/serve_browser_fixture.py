"""Offline browser fixture, kept separate from the real provider and database."""
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from local_analyzer.server import make_server
from local_analyzer.indicators import analyze
from local_analyzer.market_data import DataError
from local_analyzer.tests.test_analyzer import dataset
from local_analyzer.tests.test_company_data import ranking_pages,financial_payload
from local_analyzer.company_data import combine_rankings,parse_yahoo_financials,summarize_financials

def provider(symbol):
    if symbol=='AMZN':raise DataError('TEST provider unavailable; no real provider contacted')
    return dataset(symbol)

company_mode='--company' in sys.argv
port=8767 if company_mode else 8766
directory=Path(__file__).resolve().parents[1]/'data'/'browser-fixtures'
def ranking_provider(prices):
    primary,secondary=ranking_pages();value=combine_rankings(primary.replace('TEST0','NVDA'),secondary.replace('test0/','nvda/'))
    value['source']='https://example.com/TEST-ONLY';value['sources']=['https://example.com/TEST-ONLY'];value['discrepancies']=[{'symbol':'TEST1','relativeDifference':.015}]
    return value
def fundamental_provider(symbol):
    payload=financial_payload()
    for row in payload['timeseries']['result']:row['meta']['symbol']=[symbol]
    value=summarize_financials(parse_yahoo_financials(payload,symbol),symbol)
    value.update(source='TEST FINANCIAL FIXTURE',sourceUrls=['https://example.com/TEST-ONLY'],warnings=['Synthetic financial fixture, not real market data'])
    return value
server=make_server(port,directory/('fixture-'+str(os.getpid())+'.sqlite3'),provider,ranking_provider,fundamental_provider)
for symbol in ['NVDA','AMZN']:server.store.save(analyze(dataset(symbol)))
if company_mode:server.store.financials('NVDA',fundamental_provider('NVDA'))
print('Offline analyzer fixture: http://127.0.0.1:'+str(port),flush=True)
try:server.serve_forever()
finally:server.server_close()
