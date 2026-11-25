"""Standard-library local server. No production code or cloud credentials are loaded."""
import argparse
import json
import math
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

if __package__ in (None,''):
    sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from local_analyzer.market_data import SYMBOLS, DataError, fetch_yahoo, parse_csv, symbol_value
from local_analyzer.indicators import analyze
from local_analyzer.storage import Store
from local_analyzer.company_data import fetch_rankings,fetch_fundamentals,with_valuation,protect_financial_update
from local_analyzer.comparison import compare

ROOT=Path(__file__).resolve().parent

def validate_ranking(value):
    try:
        stamp=datetime.fromisoformat(value['asOf'].replace('Z','+00:00'))
        source=urlsplit(value['source'])
        rows=value['companies']
        if stamp.tzinfo is None or stamp.timestamp()>time.time()+300 or source.scheme!='https' or not source.hostname or source.username or source.password or len(rows)!=20:
            raise ValueError()
        previous=math.inf;seen=set()
        for row in rows:
            symbol_value(row['symbol'])
            if row['symbol'] in seen or not isinstance(row['name'],str) or not 1<=len(row['name'])<=160 or isinstance(row['marketCap'],bool) or not isinstance(row['marketCap'],(int,float)) or not math.isfinite(row['marketCap']) or not 0<row['marketCap']<=previous:
                raise ValueError()
            seen.add(row['symbol']);previous=row['marketCap']
        return {'asOf':value['asOf'],'source':value['source'],'companies':rows,'verification':'manual-import-not-independently-verified'}
    except (KeyError,TypeError,ValueError,OverflowError,AttributeError):
        raise DataError('דירוג נדרש: 20 חברות ייחודיות, שווי שוק חיובי וממויין, asOf עם אזור זמן וקישור מקור HTTPS.') from None

def make_server(port=8765,db_path=None,provider=fetch_yahoo,ranking_provider=fetch_rankings,fundamental_provider=fetch_fundamentals):
    store=Store(db_path or ROOT/'data'/'research.sqlite3')
    guard=threading.Lock();attempts=deque();last_attempt={}
    def reserve(key,cost=1,cooldown=60):
        with guard:
            now=time.monotonic()
            while attempts and now-attempts[0]>=60:attempts.popleft()
            if len(attempts)+cost>8 or now-last_attempt.get(key,-10000)<cooldown:return False
            attempts.extend([now]*cost);last_attempt[key]=now
        return True
    assets={'/':(ROOT/'web/index.html','text/html; charset=utf-8'),
        '/app.mjs':(ROOT/'web/app.mjs','application/javascript'),
        '/analyzer.css':(ROOT/'web/analyzer.css','text/css'),
        '/research.css':(ROOT.parent/'research/research.css','text/css'),
        '/chart-model.mjs':(ROOT.parent/'research/model.mjs','application/javascript')}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,format,*args):
            # Do not log request bodies or imported financial files.
            pass
        def trusted(self):
            return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
        def send(self,status,payload=None,content_type='application/json; charset=utf-8'):
            data=payload if isinstance(payload,bytes) else json.dumps(payload,ensure_ascii=False,allow_nan=False).encode()
            self.send_response(status)
            for key,value in {'Content-Type':content_type,'Content-Length':str(len(data)),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
                'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}.items():
                self.send_header(key,value)
            self.end_headers()
            if self.command!='HEAD':self.wfile.write(data)
        def do_HEAD(self):
            self.do_GET()
        def do_GET(self):
            if not self.trusted():return self.send(403,{'error':'Host rejected'})
            route=urlsplit(self.path)
            try:
                if route.path in assets:
                    file,kind=assets[route.path];return self.send(200,file.read_bytes(),kind)
                query=parse_qs(route.query)
                if route.path=='/api/health':return self.send(200,{'status':'ok','mode':'local-only','paidServices':False})
                if route.path=='/api/catalog':return self.send(200,{'symbols':[{'symbol':key,'name':value} for key,value in SYMBOLS.items()], 'ranking':store.setting('ranking')})
                if route.path=='/api/comparison':return self.send(200,{'items':store.comparison()})
                if route.path=='/api/top20/comparison':
                    ranking=store.setting('ranking');symbols=[item['symbol'] for item in (ranking or {}).get('companies',[])]
                    return self.send(200,compare(ranking,{symbol:store.latest(symbol) for symbol in symbols},{symbol:store.financials(symbol) for symbol in symbols}))
                if route.path=='/api/fundamentals':
                    symbol=symbol_value(query.get('symbol',[''])[0]);value=store.financials(symbol)
                    return self.send(200,{'fundamentals':with_valuation(value,store.latest(symbol)) if value else None,'fromCache':True})
                if route.path in ('/api/data','/api/history'):
                    symbol=symbol_value(query.get('symbol',[''])[0])
                    if route.path=='/api/history':return self.send(200,{'items':store.history(symbol)})
                    value=store.latest(symbol)
                    return self.send(200,{'analysis':value,'fromCache':True})
                if route.path=='/api/snapshot':
                    value=store.snapshot(int(query.get('id',['0'])[0]))
                    return self.send(200,{'analysis':value,'historicalSnapshot':True}) if value else self.send(404,{'error':'הניתוח לא נמצא.'})
                return self.send(404,{'error':'Not found'})
            except (DataError,ValueError):return self.send(400,{'error':'פרמטר בקשה אינו תקין.'})
            except Exception:return self.send(500,{'error':'שגיאה מקומית בקריאת הנתונים.'})
        def do_POST(self):
            if not self.trusted():return self.send(403,{'error':'Host rejected'})
            expected={'http://127.0.0.1:'+str(self.server.server_port),'http://localhost:'+str(self.server.server_port)}
            if self.headers.get('Origin') not in expected:return self.send(403,{'error':'Origin rejected'})
            if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send(415,{'error':'JSON required'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=1_000_000:return self.send(413,{'error':'Request too large or empty'})
                value=json.loads(self.rfile.read(length))
                if not isinstance(value,dict):raise DataError('בקשה אינה אובייקט JSON.')
                if self.path=='/api/ranking':return self.send(200,{'ranking':store.setting('ranking',validate_ranking(value))})
                if self.path=='/api/ranking/refresh':
                    if not reserve('ranking',4,300):return self.send(429,{'error':'המתן לפני עדכון דירוג נוסף; עדכון דורש מספר מקורות. העותק הקודם נשמר.'})
                    prices={symbol:store.latest(symbol) for symbol in ['NVDA','AAPL']}
                    ranking=ranking_provider(prices)
                    return self.send(200,{'ranking':store.setting('ranking',ranking)})
                if self.path=='/api/fundamentals/refresh':
                    symbol=symbol_value(value.get('symbol'))
                    if not reserve('financials:'+symbol,4,300):return self.send(429,{'error':'המתן לפני שליפת דוחות נוספת. שליפה משתמשת בעד 4 בקשות מקור והעותק הקודם נשמר.'})
                    result=store.financials(symbol,protect_financial_update(store.financials(symbol),fundamental_provider(symbol)))
                    return self.send(200,{'fundamentals':with_valuation(result,store.latest(symbol)),'fromCache':False})
                if self.path not in ('/api/refresh','/api/import'):return self.send(404,{'error':'Not found'})
                symbol=symbol_value(value.get('symbol'))
                if self.path=='/api/import':
                    if not isinstance(value.get('csv'),str):raise DataError('חסר קובץ CSV.')
                    dataset=parse_csv(value['csv'],symbol,value.get('source'))
                else:
                    if not reserve('price:'+symbol):return self.send(429,{'error':'המתן דקה לפני שליפה נוספת לאותו סימול. עד 8 בקשות מקור בדקה בכלי המקומי.'})
                    dataset=provider(symbol)
                return self.send(200,{'analysis':store.save(analyze(dataset)),'fromCache':False})
            except DataError as error:return self.send(422,{'error':str(error),'lastValidDataPreserved':True})
            except (ValueError,UnicodeError,TypeError):return self.send(400,{'error':'JSON או פרמטרים לא תקינים.'})
            except Exception:return self.send(500,{'error':'שגיאה מקומית; לא הוחלפו נתונים תקינים.'})
        def do_PUT(self):self.send(405,{'error':'Method not allowed'})
        def do_DELETE(self):self.send(405,{'error':'Method not allowed'})
        def do_OPTIONS(self):self.send(405,{'error':'Cross-origin access disabled'})
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.store=store
    return server

def main():
    parser=argparse.ArgumentParser(description='SmartTrade local research — no paid services or production access')
    parser.add_argument('--port',type=int,default=8765);parser.add_argument('--db',type=Path)
    args=parser.parse_args()
    if not 1<=args.port<=65535:parser.error('Invalid port')
    server=make_server(args.port,args.db)
    print(f'SmartTrade local analyzer: http://127.0.0.1:{server.server_port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
