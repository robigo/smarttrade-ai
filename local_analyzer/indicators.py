"""Daily indicators with explicit SMA seeds and Wilder smoothing (TA-Lib convention)."""
import math

VERSION='daily-technical-v1'

def sma(values, period):
    return [None if index+1<period else math.fsum(values[index-period+1:index+1])/period for index in range(len(values))]

def ema(values, period, start=0):
    output=[None]*len(values)
    if len(values)-start < period:
        return output
    index=start+period-1
    current=math.fsum(values[start:index+1])/period
    output[index]=current
    alpha=2/(period+1)
    for index in range(index+1,len(values)):
        current += alpha*(values[index]-current)
        output[index]=current
    return output

def calculate(bars):
    closes=[bar['close'] for bar in bars]
    length=len(bars)
    result={f'ma{period}':sma(closes,period) for period in (20,50,100,200)}
    for key in ('rsi','macd','signal','histogram','atr','adx','plusDI','minusDI','bbUpper','bbMiddle','bbLower'):
        result[key]=[None]*length
    middle=sma(closes,20)
    for index in range(19,length):
        deviation=math.sqrt(math.fsum((value-middle[index])**2 for value in closes[index-19:index+1])/20)
        result['bbMiddle'][index]=middle[index]
        result['bbUpper'][index]=middle[index]+2*deviation
        result['bbLower'][index]=middle[index]-2*deviation
    if length>14:
        changes=[closes[index]-closes[index-1] for index in range(1,length)]
        gain=math.fsum(max(0,value) for value in changes[:14])/14
        loss=math.fsum(max(0,-value) for value in changes[:14])/14
        for index in range(14,length):
            if index>14:
                gain=(gain*13+max(0,changes[index-1]))/14
                loss=(loss*13+max(0,-changes[index-1]))/14
            result['rsi'][index]=100*gain/(gain+loss) if gain+loss else 0.0
    slow,fast=ema(closes,26),ema(closes,12,14)
    macd=[fast[index]-slow[index] for index in range(25,length)]
    signals=ema(macd,9)
    for offset in range(8,len(macd)):
        index=offset+25
        result['macd'][index]=macd[offset]
        result['signal'][index]=signals[offset]
        result['histogram'][index]=macd[offset]-signals[offset]
    tr,plus,minus=[],[],[]
    for previous,current in zip(bars,bars[1:]):
        tr.append(max(current['high']-current['low'],abs(current['high']-previous['close']),abs(current['low']-previous['close'])))
        up=current['high']-previous['high'];down=previous['low']-current['low']
        plus.append(up if up>0 and up>down else 0.0)
        minus.append(down if down>0 and down>up else 0.0)
    if length>14:
        atr=math.fsum(tr[:14])/14
        for index in range(14,length):
            if index>14:atr=(atr*13+tr[index-1])/14
            result['atr'][index]=atr
        sm_tr,sm_plus,sm_minus=math.fsum(tr[:13]),math.fsum(plus[:13]),math.fsum(minus[:13])
        dxs=[];adx=None
        for index in range(14,length):
            sm_tr=sm_tr-sm_tr/14+tr[index-1]
            sm_plus=sm_plus-sm_plus/14+plus[index-1]
            sm_minus=sm_minus-sm_minus/14+minus[index-1]
            pos=100*sm_plus/sm_tr if sm_tr else 0.0
            neg=100*sm_minus/sm_tr if sm_tr else 0.0
            result['plusDI'][index]=pos;result['minusDI'][index]=neg
            dx=100*abs(pos-neg)/(pos+neg) if pos+neg else 0.0
            dxs.append(dx)
            if len(dxs)==14:adx=math.fsum(dxs)/14
            elif len(dxs)>14:adx=(adx*13+dx)/14
            if adx is not None:result['adx'][index]=adx
    return result

def analyze(dataset):
    bars=dataset['bars'];series=calculate(bars);latest=bars[-1]
    values={key:series[key][-1] for key in series}
    points=[{**bar,**{key:series[key][index] for key in series}} for index,bar in enumerate(bars)]
    parts=[]
    def relative(left,right):
        return 1 if left>right else 0 if left<right else .5
    for key,weight in [('ma20',10),('ma50',15),('ma100',15),('ma200',20)]:
        if values[key] is not None:
            parts.append({'label':'סגירה ביחס ל־'+key.upper(),'weight':weight,'points':weight*relative(latest['close'],values[key])})
    if values['macd'] is not None:
        parts.append({'label':'MACD ביחס לקו האיתות','weight':20,'points':20*relative(values['macd'],values['signal'])})
    if values['rsi'] is not None:
        # RSI is momentum, not a claim that overbought is a buy or oversold is a sell.
        rsi_points=10 if 45<=values['rsi']<=55 else 20 if 55<values['rsi']<=70 else 0 if values['rsi']<45 else 10
        parts.append({'label':'מומנטום RSI לפי כללי המודל','weight':20,'points':rsi_points})
    complete=len(parts)==6
    score=round(sum(part['points'] for part in parts)) if complete else None
    recent=bars[-20:-1] or bars[-1:]
    support=min(bar['low'] for bar in recent);resistance=max(bar['high'] for bar in recent)
    return {**{key:value for key,value in dataset.items() if key!='bars'},'bars':points,'engineVersion':VERSION,
        'indicators':values,'score':score,'scoreParts':parts,'scoreComplete':complete,
        'scoreMethod':'מחיר מול MA20/50/100/200: משקל 10/15/15/20; MACD מול איתות: 20; RSI: 20. RSI 45–55 או מעל 70 מקבל 10, 55–70 מקבל 20, מתחת ל־45 מקבל 0. שוויון בממוצע/ב־MACD מקבל חצי משקל. נדרשים כל הרכיבים. ציון תיאורי בלבד, ללא הסתברות או תחזית.',
        'levels':{'support':support,'resistance':resistance,'method':'גבוה/נמוך ב־19 הנרות הקודמים; רמות מכניות, לא זיהוי ודאי של תמיכה והתנגדות.'},
        'scenarios':{'bullish':f'סגירה עתידית מעל {resistance:.2f} תהיה פריצה מעל הגבוה בטווח הייחוס; פריצת שווא אפשרית.',
                     'neutral':f'סגירה בין {support:.2f} ל־{resistance:.2f} תשאיר את המחיר בתוך טווח הייחוס.',
                     'bearish':f'סגירה מתחת {support:.2f} תהיה שבירה של הנמוך בטווח הייחוס; אין יעד מחיר מובטח.'},
        'fundamentals':{'available':False,'note':'לא חובר מקור מאומת לדוחות כספיים ושווי שוק. אין כאן ניתוח פונדמנטלי מחושב.'}}
