import {appendObservation,visibleHistory,chartGeometry} from './portfolio-history-model.mjs';

// These bindings belong to the existing local simulation, not the Google ledger.
let tracked=Array.isArray(priceHistory)?structuredClone(priceHistory):null;
let previousState=state,notice='';
const currentSignature=()=>JSON.stringify({cash:state.cash,units:state.units,trades:state.trades.length,prices:A.map(asset=>[asset.id,asset.price])});
function capture(force=false){
 if(!tracked&&Array.isArray(priceHistory)&&priceHistory.length===0&&state!==previousState)tracked=[];
 if(!Array.isArray(priceHistory)||!tracked){notice='לא ניתן לקרוא את היסטוריית התיק השמורה; היא לא הוחלפה.';return}
 try{
  const nextSignature=currentSignature();
  const incomingChanged=JSON.stringify(priceHistory)!==JSON.stringify(tracked);
  const reset=incomingChanged&&priceHistory.length===0;
  const boundary=state!==previousState&&!reset&&tracked.length>0;
  const result=appendObservation(reset?[]:tracked,{timestamp:Date.now(),value:portfolio(),signature:nextSignature,breakBefore:boundary},force||incomingChanged);
  if(result.changed){localStorage.setItem(PKEY,JSON.stringify(result.history));priceHistory=result.history;tracked=structuredClone(result.history);}
  previousState=state;notice='';
 }catch{notice='נקודת השווי לא נשמרה בדפדפן. לא שונו נתוני התיק.'}
}
const ns='http://www.w3.org/2000/svg';
function shape(tag,attributes,text){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
function draw(){
 const svg=el('chart'),summary=el('chartSummary'),width=Math.max(320,Math.round(svg.clientWidth||600));svg.replaceChildren();svg.setAttribute('viewBox','0 0 '+width+' 240');svg.setAttribute('direction','ltr');
 const points=visibleHistory(priceHistory,{days:el('chartPeriod').value});
 if(!points.length){summary.textContent=notice||'אין תצפיות שמורות בתקופה שנבחרה. ניתן לשמור נקודת שווי מהמצב הנוכחי.';svg.append(shape('text',{x:width/2,y:110,'text-anchor':'middle',fill:'#b3c5d1'},'אין תצפיות בתקופה זו'));return}
 const geometry=chartGeometry(points,width),coordinates=geometry.coordinates;
 const axisMoney=value=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',notation:'compact',maximumFractionDigits:1}).format(value);
 for(const [value,y] of [[geometry.high,30],[geometry.low+(geometry.high-geometry.low)/2,110],[geometry.low,190]]){
  svg.append(shape('line',{x1:80,x2:width-25,y1:y,y2:y,stroke:'#3b4e5d','stroke-width':1}));
  svg.append(shape('text',{x:70,y:y+4,'text-anchor':'end',fill:'#b3c5d1','font-size':11},axisMoney(value)));
 }
 if(points.length>1)svg.append(shape('polyline',{points:coordinates.map(point=>point.x+','+point.y).join(' '),fill:'none',stroke:'#35bca1','stroke-width':3}));
 for(const coordinate of coordinates){const circle=shape('circle',{cx:coordinate.x,cy:coordinate.y,r:points.length===1?6:3,fill:'#35bca1'});circle.append(shape('title',{},new Date(coordinate.point.date).toLocaleString('he-IL')+' · '+money(coordinate.point.value)));svg.append(circle);}
 const labels=points.length===1?[coordinates[0]]:[coordinates[0],coordinates.at(-1)];
 const sameDay=points[0].date.slice(0,10)===points.at(-1).date.slice(0,10);
 labels.forEach((coordinate,index)=>{const date=new Date(coordinate.point.date);const text=points.length===1?date.toLocaleString('he-IL'):sameDay?date.toLocaleTimeString('he-IL'):date.toLocaleDateString('he-IL');svg.append(shape('text',{x:coordinate.x,y:220,'text-anchor':points.length===1?'middle':index===0?'start':'end',fill:'#b3c5d1','font-size':10},text));});
 summary.textContent=points.length===1?'נשמרה נקודת בסיס מהמצב הנוכחי: '+money(points[0].value)+'. לא נוצרה היסטוריה לעבר. נקודות יתווספו לאחר עסקאות ועדכוני מחירים.':points.length+' תצפיות · בתחילת התקופה: '+money(points[0].value)+' · בסופה: '+money(points.at(-1).value)+' · שינוי בשווי (לא תשואה): '+money(points.at(-1).value-points[0].value);
 if(notice)summary.textContent+=' '+notice;
}
// Existing successful trades, imports and restores call render(), which resolves
// this function dynamically. Repeated renders do not duplicate an observation.
renderChart=()=>{capture();draw()};
el('chartPeriod').onchange=draw;
const recordButton=document.createElement('button');recordButton.id='recordPortfolioPoint';recordButton.textContent='שמור נקודת שווי';recordButton.onclick=()=>{capture(true);draw()};
el('chartPeriod').parentElement.insertAdjacentElement('afterend',recordButton);
const explanation=el('chart').nextElementSibling;
if(explanation)explanation.textContent='הגרף מציג תצפיות מקומיות בשווי תיק הסימולציה, עד 120 נקודות. מחירי Twelve Data אינם מוזנים אליו. שחזור תיק מתחיל מקטע חדש; זה אינו גרף תשואה מותאמת להפקדות.';
renderChart();
new ResizeObserver(draw).observe(el('chart'));
