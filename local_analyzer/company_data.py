"""Free public company data with source dates, units and cross-checks preserved."""
import html
import json
import math
import re
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, build_opener
from local_analyzer.market_data import DataError, NoRedirects, finite, symbol_value

RANK_URL='https://companiesmarketcap.com/usa/largest-companies-in-the-usa-by-market-cap/'
CHECK_URL='https://stockanalysis.com/list/largest-us-companies/'
METRICS={
 'TotalRevenue':('הכנסות','USD'), 'GrossProfit':('רווח גולמי','USD'),
 'OperatingIncome':('רווח תפעולי','USD'), 'NetIncome':('רווח נקי','USD'),
 'DilutedEPS':('רווח מדולל למניה','USD/share'),
 'OperatingCashFlow':('תזרים מפעילות שוטפת','USD'), 'FreeCashFlow':('תזרים חופשי','USD'),
 'TotalAssets':('סך נכסים','USD'), 'TotalDebt':('חוב כולל','USD'),
 'CashCashEquivalentsAndShortTermInvestments':('מזומן והשקעות קצרות','USD'),
 'StockholdersEquity':('הון עצמי','USD'),
}

def now_iso():return datetime.now(timezone.utc).isoformat()

def download(url,kind='json',limit=3_000_000):
    request=Request(url,headers={'User-Agent':'SmartTradeLocal personal research (https://github.com/robigo/smarttrade-ai)','Accept':'application/json' if kind=='json' else 'text/html'})
    try:
        with build_opener(NoRedirects()).open(request,timeout=20) as response:
            body=response.read(limit+1)
            if len(body)>limit:raise DataError('תגובת מקור הנתונים גדולה מדי.')
            if kind not in response.headers.get('Content-Type','').lower():raise DataError('מקור הנתונים החזיר סוג תוכן לא צפוי.')
        return json.loads(body) if kind=='json' else body.decode('utf-8')
    except HTTPError as error:raise DataError(f'מקור הנתונים החזיר HTTP {error.code}; העותק הקודם נשמר.') from None
    except (URLError,OSError):raise DataError('החיבור למקור הנתונים נכשל; העותק הקודם נשמר.') from None
    except (UnicodeError,json.JSONDecodeError):raise DataError('תשובת מקור הנתונים אינה תקינה.') from None

class Tables(HTMLParser):
    def __init__(self):
        super().__init__();self.rows=[];self.row=None;self.cell=None;self.field=None;self.canonical=None
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='link' and attrs.get('rel')=='canonical':self.canonical=attrs.get('href')
        if tag=='tr':self.row={'cells':[],'links':[],'fields':{}}
        if self.row is not None:
            if tag in ('td','th'):self.cell={'attrs':attrs,'text':[]};self.row['cells'].append(self.cell)
            if tag=='a':self.row['links'].append(attrs.get('href',''))
            if tag=='div':
                for key in ['company-name','company-code']:
                    if key in attrs.get('class','').split():self.field=key;self.row['fields'][key]=[]
    def handle_data(self,data):
        if self.cell is not None:self.cell['text'].append(data)
        if self.field and self.row is not None:self.row['fields'][self.field].append(data)
    def handle_endtag(self,tag):
        if tag=='div':self.field=None
        if tag in ('td','th'):self.cell=None
        if tag=='tr' and self.row is not None:
            for cell in self.row['cells']:cell['text']=' '.join(' '.join(cell['text']).split())
            self.row['fields']={key:' '.join(' '.join(value).split()) for key,value in self.row['fields'].items()}
            self.rows.append(self.row);self.row=None;self.field=None

def canonical_symbol(symbol):
    symbol=symbol.strip().upper().replace('.','-')
    return {'GOOG':'GOOGL','BRK-A':'BRK-B'}.get(symbol,symbol)

def positive(value):
    if not finite(value) or value<=0:raise DataError('שווי שוק או מחיר אינם מספר חיובי תקין.')
    return value

def market_cap(text):
    match=re.fullmatch(r'\$?\s*([0-9,.]+)\s*([TBMK]?)',text.strip())
    if not match:raise DataError('לא ניתן לזהות שווי שוק בדולר.')
    return positive(float(match[1].replace(',',''))*{'':1,'K':1e3,'M':1e6,'B':1e9,'T':1e12}[match[2]])

def parse_rank_primary(text):
    parser=Tables();parser.feed(text)
    if parser.canonical and parser.canonical.rstrip('/')!=RANK_URL.rstrip('/'):raise DataError('עמוד הדירוג אינו עמוד החברות האמריקאיות.')
    output=[];seen=set();entities=set()
    for row in parser.rows:
        cells=row['cells'];fields=row['fields']
        if 'company-code' not in fields:continue
        if len(cells)<8 or cells[-1]['text'] not in ('USA','🇺🇸 USA'):raise DataError('הדירוג מכיל מדינה חסרה או שאינה ארה״ב.')
        symbol=canonical_symbol(fields['company-code']);symbol_value(symbol)
        entity=next((link for link in row['links'] if link.endswith('/marketcap/')),None)
        if not entity or symbol in seen or entity in entities:raise DataError('הדירוג מכיל חברה או סוג מניה כפולים.')
        try:cap=positive(float(cells[3]['attrs']['data-sort']));price=positive(float(cells[4]['text'].replace('$','').replace(',','')))
        except (ValueError,KeyError):raise DataError('ערכי דירוג לא תקינים.') from None
        if output and cap>output[-1]['marketCap']:raise DataError('דירוג שווי השוק אינו בסדר יורד.')
        seen.add(symbol);entities.add(entity)
        output.append({'rank':len(output)+1,'symbol':symbol,'sourceSymbol':fields['company-code'],'name':fields['company-name'],'marketCap':cap,'currency':'USD','country':'US','price':price,'companyKey':entity})
        if len(output)==20:break
    if len(output)!=20:raise DataError('לא התקבלו 20 חברות אמריקאיות ייחודיות.')
    return output

def parse_rank_check(text):
    parser=Tables();parser.feed(text)
    if parser.canonical and parser.canonical.rstrip('/')!=CHECK_URL.rstrip('/'):raise DataError('עמוד בדיקת הדירוג אינו תואם.')
    output=[];seen=set()
    for row in parser.rows:
        link=next((link for link in row['links'] if re.fullmatch(r'/stocks/[a-z0-9.-]+/',link)),None)
        if not link:continue
        cells=row['cells']
        if len(cells)<7 or cells[-1]['text']!='United States':raise DataError('מקור הדירוג הנוסף אינו מסווג את החברה כאמריקאית.')
        symbol=canonical_symbol(link.split('/')[2]);symbol_value(symbol)
        if symbol in seen:raise DataError('כפילות סוגי מניה בדירוג הנוסף.')
        cap=market_cap(cells[2]['text']);seen.add(symbol)
        if output and cap>output[-1]['marketCap']:raise DataError('הדירוג הנוסף אינו ממויין.')
        output.append({'symbol':symbol,'marketCap':cap})
        if len(output)==20:break
    if len(output)!=20:raise DataError('לא התקבלו 20 חברות ממקור הבדיקה.')
    return output

def parse_company_cap(text,symbol):
    parser=Tables();parser.feed(text)
    expected='https://stockanalysis.com/stocks/'+symbol.lower().replace('-','.')+'/market-cap/'
    if parser.canonical!=expected:raise DataError('עמוד שווי השוק שייך לחברה אחרת.')
    match=re.search(r'daily:\[\{d:"(\d{4}-\d{2}-\d{2})",v:([0-9.eE+]+)',text)
    if not match:raise DataError('לא נמצא שווי שוק יומי בעמוד החברה.')
    stamp=date.fromisoformat(match[1]);cap=positive(float(match[2]))
    if not 0<=(datetime.now(timezone.utc).date()-stamp).days<=7:raise DataError('שווי השוק בעמוד הבדיקה עתידי או ישן משבוע.')
    return {'symbol':symbol,'marketCap':cap,'marketCapAsOf':str(stamp),'source':expected}

def combine_rankings(primary,secondary,price_cache=None,fetched_at=None,supplements=None):
    left=parse_rank_primary(primary);right=parse_rank_check(secondary)
    right=sorted(right+list(supplements or []),key=lambda row:row['marketCap'],reverse=True)[:20]
    check={row['symbol']:row for row in right}
    if set(check)!={row['symbol'] for row in left}:raise DataError('שני מקורות הדירוג אינם מסכימים על הרכב TOP 20; נשמר הדירוג הקודם.')
    if [row['symbol'] for row in left]!=[row['symbol'] for row in right]:raise DataError('סדר החברות אינו תואם בין מקורות הדירוג; נשמר הדירוג הקודם.')
    maximum=0
    discrepancies=[]
    for row in left:
        difference=abs(row['marketCap']-check[row['symbol']]['marketCap'])/row['marketCap']
        if difference>.25:raise DataError('פער מהותי מעל 25% בשווי שוק בין המקורות; נשמר הדירוג הקודם.')
        row['comparisonMarketCap']=check[row['symbol']]['marketCap'];row['relativeDifference']=difference;row['within1Percent']=difference<=.01
        if difference>.01:discrepancies.append({'symbol':row['symbol'],'relativeDifference':difference})
        maximum=max(maximum,difference)
    samples=[]
    for symbol,dataset in (price_cache or {}).items():
        row=next((row for row in left if row['symbol']==symbol),None)
        if not row or not dataset or dataset.get('source')!='Yahoo Finance' or not dataset.get('bars'):continue
        age=(datetime.now(timezone.utc).date()-date.fromisoformat(dataset['dataDate'])).days
        latest=dataset['bars'][-1]['close'];difference=abs(row['price']-latest)/latest
        samples.append({'symbol':symbol,'dailyPriceDate':dataset['dataDate'],'relativePriceDifference':difference,'matchesWithin1Percent':difference<=.01,'dailyCacheAgeDays':age})
    return {'asOf':None,'marketDataAsOf':None,'fetchedAt':fetched_at or now_iso(),'source':RANK_URL,'sources':[RANK_URL,CHECK_URL],
        'companies':left,'verification':'two-source-membership-and-order-checked','marketCapMaxRelativeDifference':maximum,'discrepancies':discrepancies,
        'priceSpotChecks':samples,'comparisonSupplements':list(supplements or []),'scope':'US-domiciled public companies according to primary publisher; comparison list plus explicit company-page checks; one listing per company',
        'freshnessNote':'שני האתרים אינם מוסרים חותמת זמן מדויקת לשווי השוק. מועד השליפה אינו מועד נתוני השוק. בדיקת מחירים מדגמית מוצגת בנפרד.',
        'warning':'דירוג ממקורות ציבוריים בחיבור לא רשמי; התאמה בין אתרים אינה אימות בלתי תלוי לבורסה.'}

def fetch_rankings(price_cache=None):
    primary=download(RANK_URL,'html');secondary=download(CHECK_URL,'html')
    left=parse_rank_primary(primary);right=parse_rank_check(secondary);seen={row['symbol'] for row in right}
    missing=[row['symbol'] for row in left if row['symbol'] not in seen]
    if len(missing)>2:raise DataError('פער הרכב גדול בין מקורות הדירוג; נדרשת בדיקה לפני החלפת הנתונים.')
    supplements=[parse_company_cap(download('https://stockanalysis.com/stocks/'+symbol.lower().replace('-','.')+'/market-cap/','html'),symbol) for symbol in missing]
    result=combine_rankings(primary,secondary,price_cache,supplements=supplements)
    result['sources'] += [row['source'] for row in supplements]
    return result

def parse_yahoo_financials(payload,symbol,today=None):
    today=today or datetime.now(timezone.utc).date();series={}
    try:
        data=payload['timeseries']
        if data.get('error') or not isinstance(data.get('result'),list):raise DataError('Yahoo לא החזיר נתונים פיננסיים.')
        for item in data['result']:
            meta=item.get('meta',{});types=meta.get('type',[])
            if meta.get('symbol')!=[symbol] or len(types)!=1:raise DataError('הסימול הפיננסי או סוג הסדרה אינם תואמים.')
            key=types[0];expected=next((period for prefix,period in [('annual','12M'),('quarterly','3M'),('trailing','TTM')] if key.startswith(prefix)),None)
            if not expected:continue
            if not any(key==prefix+metric for prefix in ['annual','quarterly','trailing'] for metric in METRICS):continue
            output=[];seen=set()
            for row in item.get(key,[]):
                stamp=date.fromisoformat(row['asOfDate']);value=row['reportedValue']['raw']
                if str(stamp)!=row['asOfDate'] or stamp>today or row['periodType']!=expected or row['currencyCode']!='USD' or not finite(value):raise DataError('תאריך, תקופה, מטבע או ערך פיננסי אינם תקינים.')
                if str(stamp) in seen:raise DataError('נתון פיננסי כפול לאותה תקופה.')
                seen.add(str(stamp));output.append({'periodEnd':str(stamp),'periodType':expected,'value':value,'unit':'USD/share' if key.endswith('EPS') else 'USD','source':'Yahoo Finance'})
            series[key]=sorted(output,key=lambda row:row['periodEnd'])
        if not series.get('annualTotalRevenue'):raise DataError('חסרה סדרת הכנסות שנתיות.')
        return series
    except DataError:raise
    except (KeyError,TypeError,ValueError,AttributeError):raise DataError('מבנה הנתונים הפיננסיים של Yahoo אינו תקין.') from None

ROW_LABELS={
 'TotalRevenue':{'Revenue','Revenue Revenue Growth'},'GrossProfit':{'Gross Profit','Gross Profit Gross Profit Growth'},
 'OperatingIncome':{'Operating Income','Operating Income Operating Income Growth'},'NetIncome':{'Net Income','Net Income Net Income Growth'},
 'DilutedEPS':{'EPS (Diluted)','EPS (Diluted) EPS Growth'},
 'TotalAssets':{'Total Assets'},'TotalDebt':{'Total Debt'},'StockholdersEquity':{"Shareholders' Equity","Total Shareholders' Equity"},
 'CashCashEquivalentsAndShortTermInvestments':{'Cash & Short-Term Investments'},
 'OperatingCashFlow':{'Operating Cash Flow'},'FreeCashFlow':{'Free Cash Flow'},
}

def numeric_cell(text):
    if text in ('-','—','N/A','n/a',''):return None
    cleaned=text.replace(',','').replace('$','').strip()
    if cleaned.startswith('(') and cleaned.endswith(')'):cleaned='-'+cleaned[1:-1]
    if not re.fullmatch(r'-?\d+(\.\d+)?',cleaned):raise DataError('נתון בדוח אינו מספר כספי תקין.')
    value=float(cleaned)
    if not finite(value):raise DataError('נתון בדוח אינו סופי.')
    return value

def parse_statement(text,symbol,kind,today=None):
    parser=Tables();parser.feed(text);today=today or datetime.now(timezone.utc).date()
    expected=f'https://stockanalysis.com/stocks/{symbol.lower().replace("-",".")}/financials/'
    # StockAnalysis uses a dash for BRK-B as well; both URL spellings are explicit.
    alternatives={expected,expected.replace('brk.b','brk-b')}
    if not parser.canonical or not any(parser.canonical.startswith(value) for value in alternatives):raise DataError('עמוד הדוח שייך לחברה אחרת.')
    if not re.search(r'Financials\s+in\s+millions\s+USD',html.unescape(text),re.I):raise DataError('לא זוהתה יחידת millions USD בדוח.')
    if not any(row['cells'] and row['cells'][0]['text']=='Fiscal Quarter' for row in parser.rows):raise DataError('העמוד אינו דוח רבעוני; אין להציג נתון שנתי כרבעוני.')
    periods=[];result={}
    allowed={'income':set(METRICS)-{'TotalAssets','TotalDebt','StockholdersEquity','CashCashEquivalentsAndShortTermInvestments','OperatingCashFlow','FreeCashFlow'},
             'balance':{'TotalAssets','TotalDebt','StockholdersEquity','CashCashEquivalentsAndShortTermInvestments'},'cash':{'OperatingCashFlow','FreeCashFlow'}}[kind]
    for row in parser.rows:
        cells=[cell['text'] for cell in row['cells']]
        if not cells:continue
        if cells[0]=='Period Ending' and not periods:
            for cell in cells[1:6]:
                matches=re.findall(r'[A-Z][a-z]{2} \d{1,2}, \d{4}',cell)
                if not matches:raise DataError('לא זוהה תאריך סיום תקופה בדוח.')
                stamp=datetime.strptime(matches[-1],'%b %d, %Y').date()
                if stamp>today:raise DataError('הדוח מכיל תאריך עתידי.')
                periods.append(str(stamp))
            if len(periods)<2 or periods!=sorted(set(periods),reverse=True):raise DataError('תקופות הדוח אינן מסודרות או חסרות.')
            if any(not 60<=(date.fromisoformat(left)-date.fromisoformat(right)).days<=120 for left,right in zip(periods,periods[1:])):raise DataError('תאריכי הדוח אינם רבעונים רצופים.')
        if not periods:continue
        for metric in allowed:
            if metric in result or cells[0] not in ROW_LABELS[metric]:continue
            rows=[]
            for stamp,cell in zip(periods,cells[1:]):
                value=numeric_cell(cell)
                if value is not None:rows.append({'periodEnd':stamp,'periodType':'3M','value':value*(1 if metric=='DilutedEPS' else 1e6),'unit':METRICS[metric][1],'source':'StockAnalysis'})
            result[metric]=sorted(rows,key=lambda row:row['periodEnd'])
    if not any(result.values()):raise DataError('לא נמצאו שורות כספיות בדוח.')
    return result

def latest_same_period(series,period):
    return next((row for row in reversed(series) if row['periodEnd'][:7]==period),None)

def summarize_financials(series,symbol,quarterly=None,sources=None,fetched_at=None):
    quarterly=quarterly or {};series=dict(series)
    # Each replacement is kept with its own raw period-end date and source.
    for metric,rows in quarterly.items():
        merged={row['periodEnd'][:7]:row for row in series.get('quarterly'+metric,[])}
        merged.update({row['periodEnd'][:7]:row for row in rows})
        series['quarterly'+metric]=sorted(merged.values(),key=lambda row:row['periodEnd'])
    trailing_period=max((rows[-1]['periodEnd'][:7] for key,rows in series.items() if key.startswith('trailing') and rows),default=None)
    if trailing_period and latest_same_period(series.get('trailingDilutedEPS',[]),trailing_period) is None:
        annual_eps=latest_same_period(series.get('annualDilutedEPS',[]),trailing_period)
        if annual_eps is not None:
            series['trailingDilutedEPS']=[*series.get('trailingDilutedEPS',[]),{**annual_eps,'periodType':'TTM','source':'Yahoo Finance · annual 12M equals TTM','calculation':'Same 12-month annual period at fiscal year-end; not a sum of mixed periods.'}]
    output={};warnings=[]
    for prefix in ['annual','quarterly','trailing']:
        keys=[key for key in series if key.startswith(prefix) and series[key]]
        if not keys:output[prefix]={'period':None,'metrics':{}};continue
        period=max(series[key][-1]['periodEnd'][:7] for key in keys)
        metrics={}
        for metric,(label,unit) in METRICS.items():
            key=prefix+metric;row=latest_same_period(series.get(key,[]),period)
            metrics[metric]={'label':label,'unit':unit,**(row or {'value':None,'periodEnd':None,'source':None})}
        missing=[item['label'] for item in metrics.values() if item['value'] is None]
        if prefix!='trailing' and missing:warnings.append(('שנתי' if prefix=='annual' else 'רבעוני')+': חסרים נתונים לתקופה האחרונה עבור '+', '.join(missing))
        revenue=metrics['TotalRevenue']['value'];net=metrics['NetIncome']['value'];op=metrics['OperatingIncome']['value']
        derived={'netMarginPct':100*net/revenue if revenue and revenue>0 and net is not None else None,'operatingMarginPct':100*op/revenue if revenue and revenue>0 and op is not None else None}
        current=metrics['TotalRevenue'];earlier=[row for row in series.get(prefix+'TotalRevenue',[]) if current['periodEnd'] and 330<=(date.fromisoformat(current['periodEnd'])-date.fromisoformat(row['periodEnd'])).days<=400]
        derived['revenueGrowthYoYPct']=(current['value']/earlier[-1]['value']-1)*100 if earlier and earlier[-1]['value']>0 and current['value'] is not None else None
        output[prefix]={'period':period,'metrics':metrics,'derived':derived}
    quarter_end=output['quarterly']['period']
    if quarter_end:
        last=max(item['periodEnd'] for item in output['quarterly']['metrics'].values() if item.get('periodEnd'))
        if (datetime.now(timezone.utc).date()-date.fromisoformat(last)).days>180:warnings.append('הדוח הרבעוני האחרון ישן מ־180 יום; אין אישור שזהו הדוח האחרון שפורסם.')
    return {'symbol':symbol,'source':'Yahoo Finance + StockAnalysis' if quarterly else 'Yahoo Finance','fetchedAt':fetched_at or now_iso(),
        'sourceUrls':sources or [],'annual':output['annual'],'quarterly':output['quarterly'],'trailing':output['trailing'],
        'periodNote':'תאריכי Yahoo עשויים להיות מנורמלים לסוף חודש; תאריכי StockAnalysis נשמרים כפי שדווחו. אין לערבב תקופות או מטבעות.',
        'filingDate':None,'filingDateNote':'מועד ההגשה לרגולטור אינו מסופק בחיבור זה. אין להשתמש בנתונים כמידע היסטורי שהיה ידוע בזמן אמת.',
        'warnings':warnings,'verification':'live-public-provider-data; not independently audited','isSynthetic':False}

def fetch_fundamentals(symbol):
    symbol_value(symbol)
    types=[prefix+metric for prefix in ['annual','quarterly'] for metric in METRICS]+['trailingTotalRevenue','trailingNetIncome','trailingDilutedEPS']
    query=urlencode({'type':','.join(types),'period1':int(datetime(datetime.now(timezone.utc).year-5,1,1,tzinfo=timezone.utc).timestamp()),'period2':int(datetime.now(timezone.utc).timestamp())})
    yahoo_url='https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/'+symbol+'?'+query
    yahoo=parse_yahoo_financials(download(yahoo_url),symbol)
    base='https://stockanalysis.com/stocks/'+symbol.lower().replace('.','-')+'/financials/'
    quarterly={};urls=[];source_warnings=[]
    for kind,suffix in [('income',''),('balance','balance-sheet/'),('cash','cash-flow-statement/')]:
        url=base+suffix+'?p=quarterly'
        try:quarterly.update(parse_statement(download(url,'html'),symbol,kind));urls.append(url)
        except DataError as error:source_warnings.append('StockAnalysis '+kind+': '+str(error))
    comparisons=[]
    for metric,rows in quarterly.items():
        for right in rows[-1:]:
            left=latest_same_period(yahoo.get('quarterly'+metric,[]),right['periodEnd'][:7])
            if left is not None:
                difference=abs(left['value']-right['value']);scale=max(abs(left['value']),abs(right['value']),1)
                comparisons.append({'metric':metric,'yahooPeriodEnd':left['periodEnd'],'stockAnalysisPeriodEnd':right['periodEnd'],'relativeDifference':difference/scale,'within1Percent':difference/scale<=.01})
    result=summarize_financials(yahoo,symbol,quarterly, ['https://finance.yahoo.com/quote/'+symbol+'/financials/']+urls)
    result['crossChecks']=comparisons;result['sourceErrors']=source_warnings;result['warnings']+=source_warnings
    if any(not row['within1Percent'] for row in comparisons):result['warnings'].append('נמצא פער מעל 1% בין מקורות כספיים לאותה תקופה; המקור שנבחר מוצג בכל שורה.')
    return result

def protect_financial_update(previous,current):
    if not previous:return current
    if current.get('sourceErrors'):raise DataError('חלק ממקורות הדוחות נכשלו; נשמר העותק הכספי התקין הקודם.')
    for period in ['annual','quarterly','trailing']:
        old=previous.get(period,{});new=current.get(period,{})
        if old.get('period') and (not new.get('period') or new['period']<old['period']):raise DataError('מקור הדוחות החזיר תקופה ישנה יותר; נשמר העותק הקודם.')
        if old.get('period')==new.get('period'):
            for key,item in old.get('metrics',{}).items():
                if item.get('value') is not None and new.get('metrics',{}).get(key,{}).get('value') is None:raise DataError('העדכון חסר נתון שהיה זמין לאותה תקופה; נשמר העותק הקודם.')
    return current

def with_valuation(financials,analysis):
    financials=dict(financials);financials['valuation']={'priceEarningsTTM':None,'priceDate':None,'epsPeriodEnd':None}
    eps=financials.get('trailing',{}).get('metrics',{}).get('DilutedEPS',{})
    if analysis and analysis.get('source')=='Yahoo Finance' and finite(eps.get('value')) and eps['value']>0 and eps.get('periodEnd') and analysis['dataDate'][:7]>=eps['periodEnd'][:7]:
        financials['valuation']={'priceEarningsTTM':analysis['bars'][-1]['close']/eps['value'],'priceDate':analysis['dataDate'],'epsPeriodEnd':eps['periodEnd'],'method':'סגירה אחרונה במטמון חלקי EPS מדולל TTM מאותה מניה; מועדי הנתונים מוצגים בנפרד.'}
    return financials
