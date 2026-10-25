// Pure quota policy for use by a future centralized, transactional counter.
// Counters MUST be persisted atomically (e.g. a Durable Object), never in Worker globals.
export const BASIC_LIMITS=Object.freeze({perMinute:8,perDay:800});
export function windowKeys(now){
  if(!Number.isSafeInteger(now)||now<0)throw new RangeError('invalid timestamp');
  const minute=Math.floor(now/60000);
  const day=Math.floor(now/86400000);
  return {minute,day};
}
export function reserveCredit(counters,now,limits=BASIC_LIMITS){
  const {minute,day}=windowKeys(now);
  const minuteCount=counters.minute===minute?counters.minuteCount:0;
  const dayCount=counters.day===day?counters.dayCount:0;
  if(!Number.isSafeInteger(minuteCount)||minuteCount<0||!Number.isSafeInteger(dayCount)||dayCount<0)throw new RangeError('invalid counters');
  if(minuteCount>=limits.perMinute)return {allowed:false,reason:'minute_limit',retryAfterSeconds:Math.ceil(((minute+1)*60000-now)/1000),counters};
  if(dayCount>=limits.perDay)return {allowed:false,reason:'daily_limit',retryAfterSeconds:Math.ceil(((day+1)*86400000-now)/1000),counters};
  return {allowed:true,reason:'ok',retryAfterSeconds:0,counters:{minute,minuteCount:minuteCount+1,day,dayCount:dayCount+1}};
}
