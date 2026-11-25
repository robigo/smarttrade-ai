"""Explainable local screening, never substitutes missing values with a score."""
from datetime import date, datetime, timezone
import math

METHOD = ('טכני: מודל המחירים הקיים. פונדמנטלי: חמש בדיקות שוות משקל מנתונים שנתיים בלבד: '
          'שולי רווח נקי 0–30%, שולי רווח תפעולי 0–40%, צמיחת הכנסות שנתית ‎−10–30%, '
          'תזרים חופשי/הכנסות 0–25%, וחוב/הון 2–0 (נמוך עדיף). '
          'כל טווח ממופה ליניארית ל־0–20 ונחתך בקצוות. נדרשים כל חמשת הרכיבים. '
          'משולב: 50% טכני ו־50% פונדמנטלי, ללא שינוי משקל בשל נתון חסר. '
          'מחיר עד 7 ימים, תקופה שנתית עד 550 יום ועותק דוחות עד 7 ימים. '
          'דירוג יחסי רק לחברות עם אותו יום מחירים. אין התאמה ענפית; בנקים וחברות החזקה '
          'אינם בהכרח בני השוואה. זהו מסנן תיאורי ניסיוני, לא המלצה או תחזית.')

def number(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def age(value,today):
    try:return (today-date.fromisoformat(value[:10])).days
    except (TypeError,ValueError):return None

def screen(company,analysis,financials,today):
    symbol=company['symbol'];warnings=[]
    row={'symbol':symbol,'name':company['name'],'marketCap':company.get('marketCap'),
         'technicalScore':None,'fundamentalScore':None,'combinedScore':None,'rank':None,
         'dataDate':None,'financialPeriod':None,'financialFetchedAt':None,'components':[],
         'metrics':{},'warnings':warnings,'priceSource':None,'financialSources':[]}
    if analysis:
        row.update(dataDate=analysis.get('dataDate'),priceSource=analysis.get('source'))
        days=age(analysis.get('dataDate'),today)
        if analysis.get('symbol')!=symbol or analysis.get('isSynthetic') or analysis.get('providerIntegration')!='unofficial-public-chart':
            warnings.append('מחירים מיובאים או נתוני בדיקה אינם זכאים לדירוג מאומת־מקור.')
        elif days is None or not 0<=days<=7:warnings.append('מחיר חסר, עתידי או ישן מ־7 ימים.')
        elif analysis.get('scoreComplete') and number(analysis.get('score')) and 0<=analysis['score']<=100:
            row['technicalScore']=analysis['score']
        else:warnings.append('חסרה היסטוריה לציון טכני מלא.')
    else:warnings.append('טרם נשמרו מחירים למניה.')
    if not financials:
        warnings.append('טרם נשמרו דוחות למניה.');return row
    row.update(financialPeriod=financials.get('annual',{}).get('period'),financialFetchedAt=financials.get('fetchedAt'),
               financialSources=financials.get('sourceUrls',[]))
    warnings.extend(financials.get('warnings',[]))
    group=financials.get('annual',{});period=group.get('period');metrics=group.get('metrics',{})
    conflict={check['metric'] for check in financials.get('crossChecks',[]) if not check.get('within1Percent',False)}
    def value(key):
        item=metrics.get(key,{})
        return item['value'] if (key not in conflict and item.get('unit')=='USD' and number(item.get('value'))
             and item.get('periodEnd','')[:7]==period) else None
    revenue=value('TotalRevenue');net=value('NetIncome');operating=value('OperatingIncome');cash=value('FreeCashFlow');debt=value('TotalDebt');equity=value('StockholdersEquity')
    growth=group.get('derived',{}).get('revenueGrowthYoYPct')
    growth=growth if number(growth) and revenue is not None and revenue>0 and 'TotalRevenue' not in conflict else None
    ratio=lambda numerator,denominator,factor=1:numerator/denominator*factor if numerator is not None and denominator is not None and denominator>0 else None
    raw={'netMarginPct':ratio(net,revenue,100),'operatingMarginPct':ratio(operating,revenue,100),
         'revenueGrowthYoYPct':growth,'freeCashFlowMarginPct':ratio(cash,revenue,100),'debtToEquity':ratio(debt,equity)}
    row['metrics']=raw
    for key,label,low,high in [('netMarginPct','שולי רווח נקי',0,30),('operatingMarginPct','שולי רווח תפעולי',0,40),
        ('revenueGrowthYoYPct','צמיחת הכנסות שנתית',-10,30),('freeCashFlowMarginPct','תזרים חופשי/הכנסות',0,25),('debtToEquity','חוב/הון',2,0)]:
        current=raw[key];points=round(max(0,min(20,20*(current-low)/(high-low))),2) if current is not None else None
        row['components'].append({'key':key,'label':label,'value':current,'points':points,'maximum':20})
    period_age=age((period or '')+'-01',today);fetch_age=age(financials.get('fetchedAt'),today)
    valid=(financials.get('symbol')==symbol and financials.get('isSynthetic') is False and not financials.get('sourceErrors')
           and period_age is not None and 0<=period_age<=550 and fetch_age is not None and 0<=fetch_age<=7)
    if valid and all(item['points'] is not None for item in row['components']):row['fundamentalScore']=round(sum(item['points'] for item in row['components']),2)
    else:warnings.append('אין ציון פונדמנטלי מלא: חסרים רכיבים, יש מחלוקת בין מקורות או שהעותק דורש עדכון.')
    if row['technicalScore'] is not None and row['fundamentalScore'] is not None:
        row['combinedScore']=round((row['technicalScore']+row['fundamentalScore'])/2,2)
    return row

def compare(ranking,analyses,financials,today=None):
    today=today or datetime.now(timezone.utc).date()
    companies=(ranking or {}).get('companies',[])
    rows=[screen(company,analyses.get(company['symbol']),financials.get(company['symbol']),today) for company in companies]
    # Compare one price session; missing or stale data cannot lower another company's rank.
    eligible=[row for row in rows if row['combinedScore'] is not None]
    reference=max((row['dataDate'] for row in eligible),default=None)
    eligible=sorted([row for row in eligible if row['dataDate']==reference],key=lambda row:(-row['combinedScore'],row['symbol']))
    last_score=None;rank=None
    for index,row in enumerate(eligible,1):
        if row['combinedScore']!=last_score:rank=index;last_score=row['combinedScore']
        row['rank']=rank
    for row in rows:
        if row['combinedScore'] is not None and row['rank'] is None:row['warnings'].append('יום המחיר שונה מיום ההשוואה; מוצג ציון ללא מקום בדירוג.')
    rows.sort(key=lambda row:(row['rank'] is None,row['rank'] or 0,row['symbol']))
    return {'items':rows,'method':METHOD,'referenceDate':reference,'total':len(rows),'ranked':len(eligible),
            'technicalCoverage':sum(row['technicalScore'] is not None for row in rows),
            'fundamentalCoverage':sum(row['fundamentalScore'] is not None for row in rows),
            'rankingVerification':(ranking or {}).get('verification'),'rankingFetchedAt':(ranking or {}).get('fetchedAt'),
            'computedAt':datetime.now(timezone.utc).isoformat(),'providerRequests':0}
