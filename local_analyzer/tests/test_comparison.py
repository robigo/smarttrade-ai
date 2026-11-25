import copy
import json
import sys
import tempfile
import threading
import unittest
from datetime import date,timedelta
from pathlib import Path
from urllib.request import urlopen
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from local_analyzer.comparison import compare
from local_analyzer.server import make_server

TODAY=date(2026,11,25)

def fixtures(symbol='NVDA'):
    company={'symbol':symbol,'name':symbol,'marketCap':1000}
    analysis={'symbol':symbol,'dataDate':'2026-11-24','source':'Yahoo Finance','providerIntegration':'unofficial-public-chart',
              'isSynthetic':False,'scoreComplete':True,'score':80}
    metrics={key:{'value':value,'unit':'USD','periodEnd':'2026-01-31'} for key,value in
             [('TotalRevenue',100),('NetIncome',30),('OperatingIncome',40),('FreeCashFlow',25),('TotalDebt',0),('StockholdersEquity',10)]}
    finance={'symbol':symbol,'isSynthetic':False,'fetchedAt':'2026-11-25T09:00:00Z','sourceUrls':['https://example.com/TEST-ONLY'],
             'annual':{'period':'2026-01','metrics':metrics,'derived':{'revenueGrowthYoYPct':30}},'warnings':[]}
    return company,analysis,finance

def result(symbol='NVDA',mutate=None):
    company,analysis,finance=fixtures(symbol)
    if mutate:mutate(analysis,finance)
    return compare({'companies':[company]},{symbol:analysis},{symbol:finance},TODAY)['items'][0]

class ComparisonTests(unittest.TestCase):
    def test_exact_weights_and_zero_debt_not_treated_as_missing(self):
        row=result();self.assertEqual(row['fundamentalScore'],100);self.assertEqual(row['combinedScore'],90);self.assertEqual(row['rank'],1)
    def test_missing_component_does_not_renormalize_score(self):
        row=result(mutate=lambda a,f:f['annual']['metrics']['FreeCashFlow'].update(value=None))
        self.assertIsNone(row['fundamentalScore']);self.assertIsNone(row['combinedScore']);self.assertEqual(len(row['components']),5)
    def test_non_positive_equity_has_no_debt_ratio(self):
        row=result(mutate=lambda a,f:f['annual']['metrics']['StockholdersEquity'].update(value=-1))
        self.assertIsNone(row['metrics']['debtToEquity']);self.assertIsNone(row['rank'])
    def test_stale_or_future_price_does_not_rank(self):
        for stamp in ['2026-11-01','2026-11-26',None]:
            with self.subTest(stamp=stamp):self.assertIsNone(result(mutate=lambda a,f:a.update(dataDate=stamp))['combinedScore'])
    def test_stale_financial_fetch_does_not_rank(self):
        self.assertIsNone(result(mutate=lambda a,f:f.update(fetchedAt='2026-10-01T00:00:00Z'))['rank'])
    def test_stale_annual_period_does_not_rank(self):
        self.assertIsNone(result(mutate=lambda a,f:f['annual'].update(period='2024-01'))['rank'])
    def test_provider_conflict_makes_affected_component_unavailable(self):
        row=result(mutate=lambda a,f:f.update(crossChecks=[{'metric':'TotalDebt','within1Percent':False}]))
        self.assertIsNone(row['metrics']['debtToEquity']);self.assertIsNone(row['rank'])
    def test_imported_and_synthetic_prices_are_not_ranked(self):
        for change in [{'isSynthetic':True},{'providerIntegration':'manual-csv'}]:
            self.assertIsNone(result(mutate=lambda a,f:a.update(change))['rank'])
    def test_mismatched_financial_period_and_currency_are_missing(self):
        for change in [{'periodEnd':'2025-12-31'},{'unit':'EUR'}]:
            self.assertIsNone(result(mutate=lambda a,f:f['annual']['metrics']['NetIncome'].update(change))['rank'])
    def test_missing_companies_remain_visible_and_non_members_excluded(self):
        company,analysis,finance=fixtures()
        data=compare({'companies':[company,{'symbol':'AAPL','name':'Apple'}]},{'NVDA':analysis,'OTHER':analysis},{'NVDA':finance},TODAY)
        self.assertEqual(data['total'],2);self.assertEqual(data['ranked'],1);self.assertEqual(data['items'][1]['symbol'],'AAPL')
        self.assertIsNone(data['items'][1]['technicalScore'])
    def test_price_sessions_not_mixed_and_ties_share_rank(self):
        companies=[];prices={};financials={}
        for symbol in ['NVDA','AAPL','MSFT']:
            company,analysis,finance=fixtures(symbol);companies.append(company);prices[symbol]=analysis;financials[symbol]=finance
        prices['MSFT']['dataDate']='2026-11-23'
        data=compare({'companies':companies},prices,financials,TODAY)
        self.assertEqual(data['ranked'],2);self.assertEqual([item['rank'] for item in data['items']],[1,1,None])
    def test_growth_and_margins_are_bounded_not_probabilities(self):
        row=result(mutate=lambda a,f:f['annual']['metrics']['NetIncome'].update(value=-100))
        self.assertEqual(row['components'][0]['points'],0);self.assertEqual(row['fundamentalScore'],80)
    def test_comparison_endpoint_never_calls_provider_or_saves(self):
        provider=Mock(side_effect=AssertionError('Provider must not be called'))
        with tempfile.TemporaryDirectory() as tmp:
            server=make_server(0,Path(tmp)/'test.sqlite3',provider,provider,provider)
            server.store.setting('ranking',{'companies':[fixtures()[0]]})
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                with urlopen('http://127.0.0.1:'+str(server.server_port)+'/api/top20/comparison') as response:data=json.load(response)
                self.assertEqual(data['total'],1);self.assertEqual(data['providerRequests'],0);provider.assert_not_called()
                self.assertIsNone(server.store.latest('NVDA'));self.assertIsNone(server.store.financials('NVDA'))
            finally:server.shutdown();thread.join();server.server_close()

if __name__=='__main__':unittest.main()
