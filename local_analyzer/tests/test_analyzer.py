import copy
import json
import math
import sys
import tempfile
import threading
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from local_analyzer.market_data import DataError,parse_yahoo,parse_csv,validate_bars,symbol_value
from local_analyzer.indicators import calculate,analyze
from local_analyzer.server import make_server,validate_ranking
from local_analyzer.storage import Store

def bars(count=260,flat=False):
    output=[]
    for index in range(count):
        value=100 if flat else 100+index*.1+math.sin(index/8)*3
        output.append({'date':str(date(2020,1,1)+timedelta(days=index)),'open':value-.2,'high':value+1,'low':value-1,'close':value,'volume':100000+index})
    return output

def dataset(symbol='NVDA',count=260):
    data=bars(count)
    return {'symbol':symbol,'name':'Synthetic test data','currency':'USD','source':'TEST FIXTURE, NOT MARKET DATA','sourceUrl':None,'providerIntegration':'test-fixture','fetchedAt':'2020-12-31T00:00:00+00:00','dataDate':data[-1]['date'],'priceBasis':'synthetic test only','omittedRows':0,'bars':data,'isSynthetic':True,'warning':'Synthetic test fixture'}

class IndicatorTests(unittest.TestCase):
    def test_sma_known_values(self):
        values=calculate([{'date':str(date(2020,1,1)+timedelta(days=i)),'open':i+1,'high':i+2,'low':i+.5,'close':i+1,'volume':1} for i in range(220)])
        self.assertIsNone(values['ma200'][198]);self.assertEqual(values['ma200'][199],100.5)
        self.assertEqual(values['ma20'][19],10.5);self.assertEqual(values['ma100'][99],50.5)
    def test_warmup_boundaries(self):
        values=calculate(bars())
        for key,index in [('rsi',14),('atr',14),('adx',27),('macd',33),('signal',33),('bbUpper',19)]:
            self.assertTrue(all(value is None for value in values[key][:index]),key)
            self.assertIsNotNone(values[key][index],key)
    def test_flat_series_has_finite_zero_momentum(self):
        data=bars(260,True)
        for bar in data:bar.update(open=100,high=100,low=100)
        result=calculate(data)
        for key in ['rsi','macd','signal','histogram','atr','adx']:self.assertEqual(result[key][-1],0)
        self.assertEqual(result['bbUpper'][-1],100);self.assertEqual(result['bbLower'][-1],100)
    def test_monotone_gain_rsi_and_atr(self):
        data=bars(80)
        for i,bar in enumerate(data):bar.update(open=i+10,high=i+11,low=i+9,close=i+10)
        result=calculate(data)
        self.assertEqual(result['rsi'][-1],100);self.assertAlmostEqual(result['atr'][-1],2)
    def test_short_history_does_not_fabricate_score(self):
        result=analyze(dataset(count=30))
        self.assertIsNone(result['score']);self.assertFalse(result['scoreComplete']);self.assertIsNone(result['indicators']['ma200'])
    def test_score_is_auditable_and_does_not_depend_on_future_bars(self):
        data=dataset();result=analyze(data)
        self.assertEqual(result['score'],round(sum(part['points'] for part in result['scoreParts'])))
        self.assertTrue(0<=result['score']<=100)
        extended=copy.deepcopy(data['bars']);extra=copy.deepcopy(extended[-1]);extra.update(date='2021-01-01',open=999,high=1000,low=998,close=999);extended.append(extra)
        original=calculate(data['bars']);more=calculate(extended)
        for key in original:self.assertEqual(original[key],more[key][:-1])
    def test_bollinger_population_deviation(self):
        data=bars(25);result=calculate(data);window=[bar['close'] for bar in data[-20:]];mean=sum(window)/20
        expected=(sum((value-mean)**2 for value in window)/20)**.5
        self.assertAlmostEqual(result['bbUpper'][-1],mean+2*expected)
        self.assertAlmostEqual(result['bbLower'][-1],mean-2*expected)

class DataTests(unittest.TestCase):
    def payload(self):
        return {'chart':{'error':None,'result':[{'meta':{'symbol':'NVDA','currency':'USD','dataGranularity':'1d'},'timestamp':[1577889000,1577975400],
            'indicators':{'quote':[{'open':[100,110],'high':[120,130],'low':[90,100],'close':[110,120],'volume':[1000,2000]}],'adjclose':[{'adjclose':[55,60]}]}}]}}
    def test_yahoo_adjusts_all_ohlc_consistently(self):
        result=parse_yahoo(self.payload(),'NVDA');self.assertEqual(result['bars'][0]['close'],55);self.assertEqual(result['bars'][0]['open'],50);self.assertEqual(result['bars'][0]['volume'],1000)
        self.assertFalse(result['isSynthetic']);self.assertEqual(result['source'],'Yahoo Finance')
    def test_yahoo_rejects_wrong_symbol_currency_and_missing_values(self):
        for key,value in [('symbol','AAPL'),('currency','EUR'),('dataGranularity','1m')]:
            raw=self.payload();raw['chart']['result'][0]['meta'][key]=value
            with self.assertRaises(DataError):parse_yahoo(raw,'NVDA')
        raw=self.payload();raw['chart']['result'][0]['indicators']['quote'][0]['close'][0]=-1
        with self.assertRaises(DataError):parse_yahoo(raw,'NVDA')
    def test_partial_current_session_is_not_treated_as_a_daily_close(self):
        raw=self.payload();result=raw['chart']['result'][0];result['timestamp'].append(1578061800)
        for key,values in result['indicators']['quote'][0].items():values.append(values[-1])
        result['indicators']['adjclose'][0]['adjclose'].append(60)
        result['meta']['currentTradingPeriod']={'regular':{'start':1578061800,'end':1578085200}}
        parsed=parse_yahoo(raw,'NVDA',datetime.fromtimestamp(1578062000,timezone.utc))
        self.assertEqual(len(parsed['bars']),2);self.assertEqual(parsed['omittedRows'],1)
    def test_bad_dates_ohlc_and_nonfinite_values_rejected(self):
        for change in [{'date':'2099-01-01'},{'date':'2020-02-30'},{'close':float('nan')},{'low':999},{'volume':-1},{'volume':True}]:
            data=bars(2);data[-1].update(change)
            with self.assertRaises(DataError):validate_bars(data)
        data=bars(2);data[1]['date']=data[0]['date']
        with self.assertRaises(DataError):validate_bars(data)
    def test_csv_is_sorted_but_duplicates_and_html_are_rejected(self):
        text='Date,Open,High,Low,Close,Volume\n2020-01-02,10,12,9,11,100\n2020-01-01,9,11,8,10,100\n'
        result=parse_csv(text,'NVDA','User CSV');self.assertEqual(result['bars'][0]['date'],'2020-01-01')
        for value in [text+'2020-01-01,9,11,8,10,100\n','<!DOCTYPE html>verification page']:
            with self.assertRaises(DataError):parse_csv(value,'NVDA','User CSV')
    def test_symbols_cannot_select_arbitrary_urls(self):
        for value in ['../secret','https://example.com','nvda','NVDA?x=1',None]:
            with self.assertRaises(DataError):symbol_value(value)
    def test_top20_import_checks_structure_but_marks_it_unverified(self):
        ranking={'asOf':datetime.now(timezone.utc).isoformat(),'source':'https://example.com','companies':[{'symbol':'TEST'+str(i),'name':'Synthetic '+str(i),'marketCap':100-i} for i in range(20)]}
        self.assertEqual(validate_ranking(ranking)['verification'],'manual-import-not-independently-verified')
        ranking['companies'][1]['symbol']='TEST0'
        with self.assertRaises(DataError):validate_ranking(ranking)

class StorageTests(unittest.TestCase):
    def setUp(self):self.folder=tempfile.TemporaryDirectory();self.store=Store(Path(self.folder.name)/'test.sqlite3')
    def tearDown(self):self.folder.cleanup()
    def test_persistence_deduplication_and_immutable_history(self):
        analysis=analyze(dataset());first=self.store.save(analysis);self.store.save(analysis)
        self.assertEqual(len(self.store.history('NVDA')),1)
        changed=copy.deepcopy(analysis);changed['bars'][-1]['close']+=1;self.store.save(changed)
        self.assertEqual(len(self.store.history('NVDA')),2)
        self.assertEqual(self.store.snapshot(first['analysisId'])['bars'][-1]['close'],analysis['bars'][-1]['close'])
        self.assertEqual(Store(self.store.path).latest('NVDA')['bars'][-1]['close'],changed['bars'][-1]['close'])
    def test_comparison_and_history_retention(self):
        for index in range(32):
            analysis=analyze(dataset());analysis['bars'][-1]['close']+=index;self.store.save(analysis)
        self.assertEqual(len(self.store.history('NVDA')),30)
        self.store.save(analyze(dataset('AAPL')));self.assertEqual(len(self.store.comparison()),2)
    def test_failed_serialization_preserves_prior_dataset(self):
        original=self.store.save(analyze(dataset()));bad=copy.deepcopy(original);bad['score']=float('nan')
        with self.assertRaises(ValueError):self.store.save(bad)
        self.assertEqual(self.store.latest('NVDA'),original)

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory();self.calls=[]
        def provider(symbol):self.calls.append(symbol);return dataset(symbol)
        self.server=make_server(0,Path(self.folder.name)/'test.sqlite3',provider)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.origin=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join();self.folder.cleanup()
    def request(self,path,body=None,origin=True,host=None):
        headers={};payload=None
        if body is not None:
            payload=json.dumps(body).encode();headers['Content-Type']='application/json'
            if origin:headers['Origin']=self.origin if origin is True else origin
        if host:headers['Host']=host
        request=Request(self.origin+path,data=payload,headers=headers)
        try:
            with urlopen(request,timeout=5) as response:return response.status,response.read(),response.headers
        except HTTPError as error:return error.code,error.read(),error.headers
    def test_reads_do_not_contact_provider(self):
        for path in ['/','/api/health','/api/data?symbol=NVDA','/api/history?symbol=NVDA','/api/comparison']:
            status,_,_=self.request(path);self.assertEqual(status,200)
        self.assertEqual(self.calls,[])
    def test_manual_refresh_is_saved_and_rate_limited(self):
        status,body,_=self.request('/api/refresh',{'symbol':'NVDA'});self.assertEqual(status,200)
        self.assertEqual(json.loads(body)['analysis']['symbol'],'NVDA')
        self.assertEqual(self.request('/api/refresh',{'symbol':'NVDA'})[0],429)
        self.assertEqual(self.calls,['NVDA']);self.assertEqual(len(self.server.store.history('NVDA')),1)
    def test_origin_host_and_private_paths_are_protected(self):
        for origin in [False,'https://evil.example']:
            self.assertEqual(self.request('/api/refresh',{'symbol':'NVDA'},origin=origin)[0],403)
        self.assertEqual(self.request('/api/data?symbol=NVDA',host='evil.example')[0],403)
        for path in ['/../server.py','/data/research.sqlite3','/.dev.vars']:
            self.assertEqual(self.request(path)[0],404)
        self.assertEqual(self.calls,[])
    def test_invalid_import_cannot_replace_cached_data(self):
        self.server.store.save(analyze(dataset()));before=self.server.store.latest('NVDA')
        status,_,_=self.request('/api/import',{'symbol':'NVDA','csv':'<html>bad</html>','source':'test'})
        self.assertEqual(status,422);self.assertEqual(self.server.store.latest('NVDA'),before)

if __name__=='__main__':unittest.main()
