export function validateBars(bars){
  if(!Array.isArray(bars)||!bars.length)throw new Error('לא נמצאו נתונים להצגה.');
  let previous='';
  for(const bar of bars){
    if(!bar||!/^\d{4}-\d{2}-\d{2}$/.test(bar.date)||!Number.isFinite(Date.parse(bar.date))||new Date(bar.date).toISOString().slice(0,10)!==bar.date||bar.date<=previous)throw new Error('תאריכי הנתונים אינם תקינים או אינם מסודרים.');
    if(!['open','high','low','close'].every(key=>Number.isFinite(bar[key])&&bar[key]>0)||!Number.isSafeInteger(bar.volume)||bar.volume<0||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close))throw new Error('נתוני המחיר או המחזור אינם תקינים.');
    previous=bar.date;
  }
  return bars;
}
export function movingAverage(bars,window){
  if(!Number.isInteger(window)||window<1)throw new Error('Invalid moving-average window');
  let sum=0;
  return bars.map((bar,index)=>{
    sum+=bar.close;if(index>=window)sum-=bars[index-window].close;
    return index+1<window?null:sum/window;
  });
}
export function researchView(bars,count=66){
  validateBars(bars);
  if(![22,66,132,252].includes(count))throw new Error('Unsupported range');
  const ma20=movingAverage(bars,20),ma50=movingAverage(bars,50);
  const latest=bars.at(-1),previous=bars.at(-2);
  const visible=bars.slice(-count),offset=bars.length-visible.length;
  return {latest,change:previous?(latest.close/previous.close-1)*100:null,
    periodChange:visible.length>1?(latest.close/visible[0].close-1)*100:null,
    low:Math.min(...visible.map(bar=>bar.low)),high:Math.max(...visible.map(bar=>bar.high)),
    ma20:ma20.at(-1),ma50:ma50.at(-1),
    points:visible.map((bar,index)=>({...bar,ma20:ma20[index+offset],ma50:ma50[index+offset]}))};
}
export function chartScale(points,width=1000){
  const values=points.flatMap(point=>[point.low,point.high,point.ma20,point.ma50,point.ma100,point.ma200,point.bbUpper,point.bbLower].filter(Number.isFinite));
  const min=Math.min(...values),max=Math.max(...values),padding=Math.max((max-min)*.1,max*.002);
  const low=min-padding,high=max+padding;
  return {low,high,x:index=>64+(width-88)*(points.length===1?.5:index/(points.length-1)),y:value=>24+(high-value)/(high-low)*256};
}
