import test from 'node:test';
import assert from 'node:assert/strict';
import {appendObservation,visibleHistory,chartGeometry,HISTORY_LIMIT} from '../app/portfolio-history-model.mjs';
const now=Date.parse('2026-10-29T12:00:00Z');
test('new history records an observed baseline and reloads do not invent past points',()=>{
 const input=[];const result=appendObservation(input,{timestamp:now,value:15000,signature:'current'});
 assert.deepEqual(input,[]);assert.equal(result.history.length,1);assert.equal(result.history[0].date,new Date(now).toISOString());
 assert.equal(appendObservation(result.history,{timestamp:now+1000,value:15000,signature:'current'}).changed,false);
 const chart=chartGeometry(visibleHistory(result.history,{now}));assert.equal(chart.coordinates.length,1);assert.equal(chart.coordinates[0].x,327.5);
});
test('real same-value observations are retained without making up a later timestamp',()=>{
 let history=appendObservation([],{timestamp:now,value:15000,signature:'one'}).history;
 history=appendObservation(history,{timestamp:now,value:15000,signature:'two'},true).history;assert.equal(history.length,1);
 history=appendObservation(history,{timestamp:now+1000,value:15000,signature:'two'},true).history;assert.equal(history.length,2);
 const chart=chartGeometry(visibleHistory(history,{now:now+1000}));assert.ok(chart.coordinates.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));assert.equal(chart.coordinates[0].y,chart.coordinates[1].y);
});
test('irregular dates use elapsed time, and restore boundaries prevent joining unrelated portfolios',()=>{
 const history=[{date:new Date(now-10000).toISOString(),value:100},{date:new Date(now-9000).toISOString(),value:110},{date:new Date(now).toISOString(),value:120}];
 const chart=chartGeometry(visibleHistory(history,{now}));assert.equal(chart.coordinates[1].x,129.5);
 const restored=appendObservation(history,{timestamp:now+1000,value:15000,signature:'restored',breakBefore:true}).history;
 assert.equal(restored.length,4);assert.equal(visibleHistory(restored,{now:now+1000}).length,1);
});
test('invalid, future and out-of-range points do not make a synthetic chart',()=>{
 const history=[{date:new Date(now-8*86400000).toISOString(),value:100},{date:new Date(now).toISOString(),value:'15000'},{date:'bad',value:100},{date:new Date(now+1000).toISOString(),value:100},{date:new Date(now-1000).toISOString(),value:null}];
 assert.equal(visibleHistory(history,{now,days:'7'}).length,1);assert.equal(visibleHistory(history,{now,days:'all'}).length,2);
 assert.throws(()=>appendObservation(history,{timestamp:now,value:Infinity,signature:'invalid'}));
});
test('legacy entries are preserved while retained observations remain bounded',()=>{
 const legacy={date:'2026-10-19',value:15000};let history=[legacy];history=appendObservation(history,{timestamp:now,value:15000,signature:'start'}).history;assert.deepEqual(history[0],legacy);
 for(let i=1;i<=130;i++)history=appendObservation(history,{timestamp:now+i,value:15000,signature:String(i)},true).history;
 assert.equal(history.length,HISTORY_LIMIT);
});
test('large finite imported valuations do not create infinite plot coordinates',()=>{
 const chart=chartGeometry([{date:new Date(now).toISOString(),value:Number.MAX_VALUE}]);
 assert.ok(Number.isFinite(chart.high));assert.ok(Number.isFinite(chart.low));assert.ok(chart.coordinates.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
});
