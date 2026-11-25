"""Public daily price data. Provider errors never become synthetic prices."""
import csv
import io
import json
import math
import re
from datetime import date, datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

SYMBOLS = {
    'NVDA': 'NVIDIA', 'AAPL': 'Apple', 'MSFT': 'Microsoft', 'AMZN': 'Amazon',
    'GOOGL': 'Alphabet', 'META': 'Meta', 'TSLA': 'Tesla', 'AVGO': 'Broadcom',
    'BRK-B': 'Berkshire Hathaway', 'LLY': 'Eli Lilly', 'JPM': 'JPMorgan Chase',
    'WMT': 'Walmart', 'V': 'Visa', 'MA': 'Mastercard', 'ORCL': 'Oracle',
    'COST': 'Costco', 'NFLX': 'Netflix', 'AMD': 'AMD', 'SPY': 'S&P 500 ETF',
    'QQQ': 'Nasdaq 100 ETF',
}

class DataError(ValueError):
    pass

def symbol_value(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}', value):
        raise DataError('סימול לא תקין. יש להזין אותיות גדולות בלבד.')
    return value

def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def validate_bars(bars, today=None):
    today = today or date.today()
    if not isinstance(bars, list) or not 2 <= len(bars) <= 5000:
        raise DataError('נדרשות 2–5,000 נקודות מחיר יומיות.')
    previous = ''
    for bar in bars:
        if not isinstance(bar, dict):
            raise DataError('רשומת מחיר אינה תקינה.')
        try:
            stamp = date.fromisoformat(bar['date'])
        except (KeyError, TypeError, ValueError):
            raise DataError('תאריך מחיר אינו תקין.') from None
        if str(stamp) != bar['date'] or stamp > today or bar['date'] <= previous:
            raise DataError('התאריכים עתידיים, כפולים או לא ממוינים.')
        if any(not finite(bar.get(key)) or bar[key] <= 0 for key in ('open','high','low','close')):
            raise DataError('מחיר חסר, לא סופי או לא חיובי.')
        if not isinstance(bar.get('volume'), int) or isinstance(bar['volume'], bool) or bar['volume'] < 0:
            raise DataError('מחזור המסחר אינו תקין.')
        if bar['low'] > min(bar['open'],bar['close']) or bar['high'] < max(bar['open'],bar['close']):
            raise DataError('ערכי פתיחה/סגירה חורגים מגבוה/נמוך.')
        previous = bar['date']
    return bars

def parse_yahoo(payload, symbol, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        chart = payload['chart']
        if chart.get('error') or len(chart.get('result') or []) != 1:
            raise DataError('Yahoo לא החזיר סדרת מחירים.')
        result = chart['result'][0]
        meta = result['meta']
        if meta.get('symbol') != symbol or meta.get('currency') != 'USD' or meta.get('dataGranularity') != '1d':
            raise DataError('הסימול, המטבע או תדירות הנתונים אינם תואמים.')
        stamps = result['timestamp']
        quote = result['indicators']['quote'][0]
        adjusted = result['indicators'].get('adjclose', [{}])[0].get('adjclose')
        if not isinstance(stamps, list) or any(len(quote[key]) != len(stamps) for key in ('open','high','low','close','volume')):
            raise DataError('אורכי סדרות המחירים אינם תואמים.')
        if adjusted is None or len(adjusted) != len(stamps):
            raise DataError('לא התקבלה סדרת סגירה מתואמת עקבית.')
        regular = meta.get('currentTradingPeriod', {}).get('regular', {})
        current_session = datetime.fromtimestamp(regular['start'], timezone.utc).date() if finite(regular.get('start')) else None
        end = regular.get('end')
        bars, omitted = [], 0
        for index, stamp in enumerate(stamps):
            if not finite(stamp):
                raise DataError('חותמת זמן של ספק אינה תקינה.')
            day = datetime.fromtimestamp(stamp, timezone.utc).date()
            if day == now.date() and (not finite(end) or now.timestamp() < end + 60):
                omitted += 1
                continue
            if day == current_session and (not finite(end) or now.timestamp() < end + 60):
                omitted += 1
                continue
            values = {key: quote[key][index] for key in ('open','high','low','close','volume')}
            # A missing provider row must not be interpolated into a trading day.
            if any(value is None for value in values.values()) or adjusted[index] is None:
                omitted += 1
                continue
            if not all(finite(value) for value in values.values()) or not finite(adjusted[index]) or values['close'] <= 0 or adjusted[index] <= 0:
                raise DataError('הספק החזיר ערך מחיר לא תקין.')
            if values['volume'] < 0 or int(values['volume']) != values['volume']:
                raise DataError('הספק החזיר מחזור לא תקין.')
            factor = adjusted[index] / values['close']
            bars.append({'date': str(day), **{key: values[key]*factor for key in ('open','high','low','close')}, 'volume': int(values['volume'])})
        validate_bars(bars, now.date())
        return {'symbol':symbol, 'name':meta.get('longName') or SYMBOLS.get(symbol,symbol), 'currency':'USD',
            'source':'Yahoo Finance', 'sourceUrl':'https://finance.yahoo.com/quote/'+symbol+'/history/',
            'providerIntegration':'unofficial-public-chart', 'fetchedAt':now.isoformat(), 'dataDate':bars[-1]['date'],
            'interval':'1d', 'priceBasis':'OHLC adjusted by adjusted-close/close; volume as provided',
            'omittedRows':omitted, 'bars':bars, 'isSynthetic':False,
            'warning':'נתוני סוף יום ממקור ציבורי בחיבור לא רשמי; זמינות ודיוק אינם מובטחים. אין כאן מחיר מסחר חי.'}
    except DataError:
        raise
    except (KeyError, IndexError, TypeError, ValueError, OverflowError, AttributeError):
        raise DataError('מבנה תשובת Yahoo אינו תקין.') from None

class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def fetch_yahoo(symbol):
    symbol_value(symbol)
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?' + urlencode({'interval':'1d','range':'2y','events':'div,splits'})
    request = Request(url, headers={'User-Agent':'SmartTradeLocal/0.1 personal research','Accept':'application/json'})
    try:
        with build_opener(NoRedirects()).open(request, timeout=20) as response:
            body = response.read(2_000_001)
            if len(body)>2_000_000 or 'json' not in response.headers.get('Content-Type','').lower():
                raise DataError('הספק לא החזיר JSON תקין או שהתגובה גדולה מדי.')
        return parse_yahoo(json.loads(body),symbol)
    except HTTPError as error:
        raise DataError(f'Yahoo HTTP {error.code}; הנתונים הקודמים נשמרו.') from None
    except (URLError, OSError) as error:
        raise DataError(f'חיבור Yahoo נכשל: {type(error).__name__}; הנתונים הקודמים נשמרו.') from None
    except (json.JSONDecodeError, UnicodeError):
        raise DataError('תשובת Yahoo אינה JSON תקין.') from None

def parse_csv(text, symbol, source_name):
    symbol_value(symbol)
    if not isinstance(source_name,str) or not 2 <= len(source_name.strip()) <= 160:
        raise DataError('יש לציין מקור לקובץ המחירים.')
    reader = csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    if not reader.fieldnames or len(reader.fieldnames)!=6 or {key.lower() for key in reader.fieldnames} != {'date','open','high','low','close','volume'}:
        raise DataError('כותרות CSV נדרשות: Date,Open,High,Low,Close,Volume.')
    bars=[]
    try:
        for row in reader:
            if len(bars)>=5000:
                raise DataError('CSV גדול מדי.')
            lower={key.lower():value for key,value in row.items()}
            shares=float(lower['volume'])
            if not math.isfinite(shares) or shares<0 or int(shares)!=shares:
                raise DataError('מחזור CSV אינו תקין.')
            bars.append({'date':lower['date'],**{key:float(lower[key]) for key in ('open','high','low','close')},'volume':int(shares)})
    except (TypeError, ValueError, KeyError, AttributeError):
        raise DataError('CSV מכיל שורה או מספר לא תקינים.') from None
    bars.sort(key=lambda bar:bar['date']);validate_bars(bars)
    return {'symbol':symbol,'name':SYMBOLS.get(symbol,symbol),'currency':'USD','source':source_name.strip(),
        'sourceUrl':None,'providerIntegration':'manual-csv','fetchedAt':datetime.now(timezone.utc).isoformat(),
        'dataDate':bars[-1]['date'],'interval':'1d','priceBasis':'User-provided OHLC; adjustment not independently verified',
        'omittedRows':0,'bars':bars,'isSynthetic':False,'warning':'קובץ מיובא, לא אומת מול ספק עצמאי. המחירים נדרשים בדולר.'}
