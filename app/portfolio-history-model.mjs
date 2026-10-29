export const HISTORY_LIMIT=120;
const validValue=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)>=0;
export function appendObservation(history,{timestamp,value,signature,breakBefore=false},force=false){
 if(!Array.isArray(history)||!Number.isSafeInteger(timestamp)||!Number.isFinite(new Date(timestamp).getTime())||!validValue(value)||typeof signature!=='string'||!signature)throw Error('Invalid portfolio observation');
 const previous=history.findLast(point=>point?.kind==='observation'&&validValue(point.value)&&Number.isFinite(Date.parse(point.date)));
 if(!force&&!breakBefore&&previous?.signature===signature)return {history,changed:false};
 const point={date:new Date(timestamp).toISOString(),value:Number(value),signature,kind:'observation',breakBefore};
 const next=history.slice();const last=next.at(-1);
 if(last?.kind==='observation'&&last.date===point.date)next[next.length-1]={...point,breakBefore:breakBefore||last.breakBefore===true};
 else next.push(point);
 return {history:next.slice(-HISTORY_LIMIT),changed:true};
}
export function visibleHistory(history,{now=Date.now(),days='all'}={}){
 if(!Array.isArray(history)||!['all','7','30','90','365'].includes(String(days)))return [];
 const start=history.findLastIndex(point=>point?.breakBefore===true);
 const cutoff=days==='all'?0:now-Number(days)*86400000;
 const points=new Map();
 for(const point of history.slice(Math.max(0,start))){
  const time=typeof point?.date==='string'?Date.parse(point.date):NaN;
  if(!validValue(point?.value)||!Number.isFinite(time)||time<cutoff||time>now)continue;
  points.set(time,{date:new Date(time).toISOString(),value:Number(point.value)});
 }
 return [...points.entries()].sort((a,b)=>a[0]-b[0]).slice(-HISTORY_LIMIT).map(([,point])=>point);
}
export function chartGeometry(points,width=600){
 if(!points.length)return null;
 const values=points.map(point=>point.value),minimum=Math.min(...values),maximum=Math.max(...values);
 const padding=Math.max(1,(maximum-minimum)*.1,maximum*.005);
 const low=Math.max(0,minimum-padding),high=Math.min(Number.MAX_VALUE,maximum+padding);
 const first=Date.parse(points[0].date),last=Date.parse(points.at(-1).date);
 const right=width-25;
 return {low,high,coordinates:points.map(point=>({x:last===first?(80+right)/2:80+(Date.parse(point.date)-first)/(last-first)*(right-80),y:190-(point.value-low)/(high-low)*160,point}))};
}
