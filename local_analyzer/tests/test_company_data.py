import copy
import json
import re
import sys
import tempfile
import threading
import unittest
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from local_analyzer.company_data import (DataError,parse_rank_primary,parse_rank_check,combine_rankings,parse_company_cap,
    parse_yahoo_financials,parse_statement,summarize_financials,with_valuation,protect_financial_update,METRICS,RANK_URL,CHECK_URL)
from local_analyzer.storage import Store

def ranking_pages():
    left=['<link rel="canonical" href="'+RANK_URL+'"><table>'];right=['<link rel="canonical" href="'+CHECK_URL+'"><table>']
    for index in range(20):
        symbol='TEST'+str(index);cap=1_000_000_000_000-index*20_000_000_000
        left.append(f'<tr><td></td><td>{index+1}</td><td><a href="/company-{index}/marketcap/"><div class="company-name">Synthetic {index}</div><div class="company-code">{symbol}</div></a></td><td data-sort="{cap}">$1T</td><td>$100</td><td></td><td></td><td>USA</td></tr>')
        right.append(f'<tr><td>{index+1}</td><td><a href="/stocks/{symbol.lower()}/">Synthetic {index}</a></td><td>{cap/1e9:g}B</td><td>$100</td><td></td><td></td><td>United States</td></tr>')
    return ''.join(left)+'</table>',''.join(right)+'</table>'

def financial_payload():
    values={
      'annualTotalRevenue':[('2024-12-31',100),('2025-12-31',120)],'annualNetIncome':[('2025-12-31',30)],
      'annualDilutedEPS':[('2025-12-31',4)],'quarterlyTotalRevenue':[('2026-03-31',35),('2026-06-30',40)],
      'quarterlyNetIncome':[('2026-03-31',5)],'trailingTotalRevenue':[('2025-12-31',120)],
      'trailingDilutedEPS':[('2025-09-30',3)],
    }
    rows=[]
    for key,items in values.items():
        period='12M' if key.startswith('annual') else '3M' if key.startswith('quarterly') else 'TTM'
        rows.append({'meta':{'symbol':['TEST'],'type':[key]},key:[{'asOfDate':stamp,'periodType':period,'currencyCode':'USD','reportedValue':{'raw':value}} for stamp,value in items]})
    return {'timeseries':{'result':rows,'error':None}}

def statement_page(label='Revenue Revenue Growth',values=('120','100'),unit='millions USD',fiscal='Fiscal Quarter'):
    return f'''<link rel="canonical" href="https://stockanalysis.com/stocks/test/financials/">Financials in {unit}.<table><tr><th>{fiscal}</th><th>Q2</th><th>Q1</th></tr><tr><th>Period Ending</th><th>Jun '26 Jun 28, 2026</th><th>Mar '26 Mar 29, 2026</th></tr><tr><td>{label}</td><td>{values[0]}</td><td>{values[1]}</td></tr></table>'''

class RankingTests(unittest.TestCase):
    def test_numeric_market_caps_us_country_and_sources_are_preserved(self):
        primary,secondary=ranking_pages();result=combine_rankings(primary,secondary)
        self.assertEqual(len(result['companies']),20);self.assertEqual(result['companies'][0]['marketCap'],1e12)
        self.assertIsNone(result['asOf']);self.assertIsNone(result['marketDataAsOf']);self.assertIn('fetchedAt',result)
        self.assertEqual(result['verification'],'two-source-membership-and-order-checked')
    def test_foreign_rows_duplicates_and_wrong_page_are_rejected(self):
        primary,secondary=ranking_pages()
        for page in [primary.replace('USA','Canada',1),primary.replace('TEST1</div>','TEST0</div>',1),primary.replace(RANK_URL,'https://example.com/not-us')]:
            with self.assertRaises(DataError):parse_rank_primary(page)
        with self.assertRaises(DataError):parse_rank_check(secondary.replace('United States','Canada',1))
    def test_membership_and_sort_changes_are_not_silently_accepted(self):
        primary,secondary=ranking_pages()
        with self.assertRaises(DataError):combine_rankings(primary,secondary.replace('/stocks/test1/','/stocks/other/'))
        with self.assertRaises(DataError):parse_rank_primary(primary.replace('data-sort="980000000000"','data-sort="1100000000000"'))
    def test_small_numerical_disagreement_is_exposed_and_not_called_exact(self):
        primary,secondary=ranking_pages();secondary=secondary.replace('980B','994.7B')
        result=combine_rankings(primary,secondary)
        self.assertEqual(result['discrepancies'][0]['symbol'],'TEST1');self.assertFalse(result['companies'][1]['within1Percent'])
    def test_explicit_company_page_can_fill_comparison_list_coverage_gap(self):
        primary,secondary=ranking_pages();primary=primary.replace('TEST0','BRK-B')
        secondary=re.sub(r'<tr><td>1</td>.*?</tr>','',secondary,count=1)
        secondary=secondary.replace('</table>','<tr><td>20</td><td><a href="/stocks/other/">Other</a></td><td>1B</td><td>$1</td><td></td><td></td><td>United States</td></tr></table>')
        stamp=datetime.now(timezone.utc).date().isoformat()
        supplement=parse_company_cap('<link rel="canonical" href="https://stockanalysis.com/stocks/brk.b/market-cap/"><script>tables:{daily:[{d:"'+stamp+'",v:1000000000000}]}</script>','BRK-B')
        self.assertEqual(supplement['symbol'],'BRK-B');self.assertEqual(supplement['marketCap'],1e12)
        result=combine_rankings(primary,secondary,supplements=[supplement]);self.assertEqual(result['companies'][0]['symbol'],'BRK-B');self.assertEqual(len(result['companies']),20)
    def test_price_spot_checks_do_not_invent_a_market_cap_timestamp(self):
        primary,secondary=ranking_pages();data={'source':'Yahoo Finance','dataDate':'2026-11-24','bars':[{'close':100}]}
        result=combine_rankings(primary,secondary,{'TEST0':data})
        self.assertTrue(result['priceSpotChecks'][0]['matchesWithin1Percent']);self.assertIsNone(result['marketDataAsOf'])

class FinancialTests(unittest.TestCase):
    def test_symbol_currency_period_and_duplicates_are_validated(self):
        for mutate in [lambda row:row['meta'].update(symbol=['WRONG']),lambda row:row['annualTotalRevenue'][0].update(currencyCode='EUR'),lambda row:row['annualTotalRevenue'][0].update(periodType='9M')]:
            payload=financial_payload();mutate(payload['timeseries']['result'][0])
            with self.assertRaises(DataError):parse_yahoo_financials(payload,'TEST')
        payload=financial_payload();row=payload['timeseries']['result'][0];row['annualTotalRevenue'].append(row['annualTotalRevenue'][0])
        with self.assertRaises(DataError):parse_yahoo_financials(payload,'TEST')
    def test_quarterly_values_are_not_used_to_fill_missing_annual_or_other_quarter(self):
        result=summarize_financials(parse_yahoo_financials(financial_payload(),'TEST'),'TEST')
        self.assertEqual(result['annual']['metrics']['NetIncome']['value'],30)
        self.assertIsNone(result['quarterly']['metrics']['NetIncome']['value'])
        self.assertIsNone(result['quarterly']['derived']['netMarginPct'])
        self.assertAlmostEqual(result['annual']['derived']['netMarginPct'],25)
        self.assertAlmostEqual(result['annual']['derived']['revenueGrowthYoYPct'],20)
    def test_ttm_eps_can_use_identical_annual_12m_period_but_not_older_eps(self):
        result=summarize_financials(parse_yahoo_financials(financial_payload(),'TEST'),'TEST')
        eps=result['trailing']['metrics']['DilutedEPS'];self.assertEqual(eps['value'],4);self.assertIn('annual',eps['source'])
        valuation=with_valuation(result,{'source':'Yahoo Finance','dataDate':'2026-01-05','bars':[{'close':100}]})
        self.assertEqual(valuation['valuation']['priceEarningsTTM'],25)
        self.assertIsNone(with_valuation(result,{'source':'manual','dataDate':'2026-01-05','bars':[{'close':100}]})['valuation']['priceEarningsTTM'])
    def test_statement_million_conversion_and_raw_actual_period_end(self):
        data=parse_statement(statement_page(),'TEST','income')
        self.assertEqual(data['TotalRevenue'][-1]['value'],120e6);self.assertEqual(data['TotalRevenue'][-1]['periodEnd'],'2026-06-28')
    def test_balance_zero_and_negative_income_remain_distinct_from_missing(self):
        values=parse_statement(statement_page('Total Debt',('0','20')),'TEST','balance');self.assertEqual(values['TotalDebt'][-1]['value'],0)
        values=parse_statement(statement_page('Net Income',('-10','20')),'TEST','income');self.assertEqual(values['NetIncome'][-1]['value'],-10e6)
    def test_wrong_currency_company_and_annual_page_cannot_be_called_quarterly(self):
        for page in [statement_page(unit='millions EUR'),statement_page().replace('/test/','/wrong/'),statement_page(fiscal='Fiscal Year')]:
            with self.assertRaises(DataError):parse_statement(page,'TEST','income')
    def test_generic_eps_is_not_claimed_to_be_diluted_eps(self):
        with self.assertRaises(DataError):parse_statement(statement_page('Earnings Per Share EPS Growth'),'TEST','income')
    def test_missing_financial_values_and_filing_date_are_explicit(self):
        value=summarize_financials(parse_yahoo_financials(financial_payload(),'TEST'),'TEST')
        self.assertIsNone(value['filingDate']);self.assertIsNone(value['annual']['metrics']['TotalDebt']['value']);self.assertTrue(value['warnings'])

class FinancialStoreTests(unittest.TestCase):
    def test_financial_migration_preserves_price_history_and_deduplicates(self):
        from local_analyzer.tests.test_analyzer import dataset
        from local_analyzer.indicators import analyze
        with tempfile.TemporaryDirectory() as folder:
            store=Store(Path(folder)/'test.sqlite3');store.save(analyze(dataset()))
            value=summarize_financials(parse_yahoo_financials(financial_payload(),'TEST'),'TEST')
            store.financials('TEST',value);value['fetchedAt']='2026-11-25T12:00:00+00:00';store.financials('TEST',value)
            self.assertEqual(len(store.history('NVDA')),1);self.assertEqual(store.financials('TEST')['symbol'],'TEST')
            connection=store.connect()
            try:self.assertEqual(connection.execute('SELECT count(*) FROM fundamental_history').fetchone()[0],1)
            finally:connection.close()

class FinancialUpdateTests(unittest.TestCase):
    def value(self):return summarize_financials(parse_yahoo_financials(financial_payload(),'TEST'),'TEST')
    def test_partial_provider_failure_cannot_replace_a_valid_cache(self):
        old=self.value();new=copy.deepcopy(old);new['sourceErrors']=['HTTP 403']
        with self.assertRaises(DataError):protect_financial_update(old,new)
    def test_regressed_period_or_lost_value_cannot_replace_a_valid_cache(self):
        old=self.value();new=copy.deepcopy(old);new['annual']['period']='2024-12'
        with self.assertRaises(DataError):protect_financial_update(old,new)
        new=copy.deepcopy(old);new['annual']['metrics']['TotalRevenue']['value']=None
        with self.assertRaises(DataError):protect_financial_update(old,new)
    def test_newer_yahoo_quarter_is_not_discarded_by_an_older_secondary_page(self):
        series=parse_yahoo_financials(financial_payload(),'TEST')
        secondary={'TotalRevenue':[{'periodEnd':'2026-03-29','periodType':'3M','value':34,'source':'StockAnalysis','unit':'USD'}]}
        result=summarize_financials(series,'TEST',secondary)
        self.assertEqual(result['quarterly']['metrics']['TotalRevenue']['value'],40)

class CompanyEndpointTests(unittest.TestCase):
    def setUp(self):
        from local_analyzer.server import make_server
        self.folder=tempfile.TemporaryDirectory();self.calls=[];self.fail_rank=False;self.fail_financials=False
        primary,secondary=ranking_pages();self.ranking=combine_rankings(primary,secondary)
        self.finance=summarize_financials(parse_yahoo_financials(financial_payload(),'TEST'),'TEST')
        def rank(prices):
            self.calls.append('rank')
            if self.fail_rank:raise DataError('TEST ranking failure')
            return self.ranking
        def finance(symbol):
            self.calls.append('finance')
            if self.fail_financials:raise DataError('TEST financial failure')
            return {**self.finance,'symbol':symbol}
        self.server=make_server(0,Path(self.folder.name)/'test.sqlite3',ranking_provider=rank,fundamental_provider=finance)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.origin=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join();self.folder.cleanup()
    def call(self,path,value=None):
        headers={'Origin':self.origin,'Content-Type':'application/json'};request=Request(self.origin+path,data=json.dumps(value).encode() if value is not None else None,headers=headers)
        try:
            with urlopen(request,timeout=5) as response:return response.status,json.load(response)
        except HTTPError as error:return error.code,json.load(error)
    def test_company_reads_are_cached_and_manual_actions_share_source_budget(self):
        self.assertEqual(self.call('/api/fundamentals?symbol=TEST')[0],200);self.assertEqual(self.calls,[])
        self.assertEqual(self.call('/api/ranking/refresh',{})[0],200);self.assertEqual(self.call('/api/fundamentals/refresh',{'symbol':'TEST'})[0],200)
        self.assertEqual(self.call('/api/refresh',{'symbol':'NVDA'})[0],429)
        self.assertEqual(self.calls,['rank','finance'])
    def test_failed_ranking_preserves_previous_settings(self):
        self.server.store.setting('ranking',self.ranking);self.fail_rank=True
        self.assertEqual(self.call('/api/ranking/refresh',{})[0],422);self.assertEqual(self.server.store.setting('ranking'),self.ranking)
    def test_failed_financial_provider_preserves_cached_financials(self):
        self.server.store.financials('TEST',self.finance);self.fail_financials=True
        self.assertEqual(self.call('/api/fundamentals/refresh',{'symbol':'TEST'})[0],422);self.assertEqual(self.server.store.financials('TEST'),self.finance)
