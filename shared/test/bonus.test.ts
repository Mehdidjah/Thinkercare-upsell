import assert from 'node:assert/strict';
import {test} from 'vitest';
import * as b from '../src/index.js';
import {reportScope} from '../src/index.js';
const rule=(mode:b.BonusMode)=>({...b.DEFAULT_BONUS,mode});
for(const [n,r,f] of [[0,0,0],[1,0,0],[59,0,0],[60,2700,45],[61,2745,90],[100,4500,1845]]){
 test('Retroactive '+n,()=>assert.equal(b.bonusEstimate(n,rule('all_month')).estimatedDzd,r));
 test('From 60 inclusive '+n,()=>assert.equal(b.bonusEstimate(n,rule('from_threshold')).estimatedDzd,f));
 test('Pending does not promise money '+n,()=>assert.equal(b.bonusEstimate(n,rule('pending')).estimatedDzd,null));
}
test('Remaining to threshold',()=>assert.equal(b.bonusEstimate(37,rule('all_month')).remaining,23));
test('60 means reached, not strictly greater',()=>assert.equal(b.bonusEstimate(60,rule('all_month')).reached,true));
test('Progress caps at 100%',()=>assert.equal(b.bonusEstimate(200,rule('all_month')).progress,100));
test('Reject negative and noninteger count',()=>{assert.throws(()=>b.bonusEstimate(-1,rule('all_month')));assert.throws(()=>b.bonusEstimate(1.5,rule('all_month')))});
test('Reject bad threshold',()=>assert.throws(()=>b.bonusEstimate(2,{...rule('all_month'),threshold:0})));
test('November UTC bounds',()=>assert.deepEqual(b.monthBounds('2026-11'),{from:'2026-11-01',to:'2026-11-30',startUtc:'2026-10-31T23:00:00.000Z',endUtc:'2026-11-30T23:00:00.000Z'}));
test('Leap month supported',()=>assert.equal(b.monthBounds('2028-02').to,'2028-02-29'));
test('Algiers monthly rollover',()=>assert.equal(b.algerDay('2026-11-30T23:00:00Z'),'2026-12-01'));
test('Invalid months rejected',()=>{for(const m of ['2026-00','2026-13','2026-1','2026-11<script>',''])assert.equal(b.validMonth(m),false)});
test('No contributions for empty input',()=>assert.deepEqual(b.sumContributions([]),b.emptyContribution()));
test('Net incremental revenue not added catalogue',()=>{const s=b.sumContributions([{user_id:'u',day:'2026-11-13',calls:30,confirmations:30,upsells:30,upsells_touche:30,upsells_belnco:0,initial_dzd:54000,confirmed_dzd:81000,uplift_dzd:27000,without_ref:0,duplicates:0}]);assert.equal(s.upliftDzd,27000);assert.equal(s.confirmedDzd,s.initialDzd+s.upliftDzd)});
test('Upsells sold per brand: each day’s Touché and BEL.NCO units add up, and the brands sum to the total',()=>{
 const row=(day:string,touche:number,belnco:number)=>({user_id:'u',day,calls:5,confirmations:4,upsells:touche+belnco,upsells_touche:touche,upsells_belnco:belnco,initial_dzd:0,confirmed_dzd:0,uplift_dzd:0,without_ref:0,duplicates:0});
 const s=b.sumContributions([row('2026-11-13',3,2),row('2026-11-14',4,0),row('2026-11-15',0,1)]);
 assert.deepEqual(s.upsellsByBrand,{touche:7,belnco:3});
 assert.equal(s.upsells,10);
 assert.deepEqual(b.sumContributions([]).upsellsByBrand,{touche:0,belnco:0});
});
test('Direction and manager roles',()=>{assert.ok(b.canViewDirection({role:'admin'}));assert.ok(b.canViewDirection({role:'manager'}));for(const role of ['advisor',''])assert.equal(b.canViewDirection({role}),false)});
test('Advisor own scope regardless of former team flag',()=>assert.deepEqual(reportScope({id:'u',role:'advisor',team:'A',reporting_scope:'team'}),{userId:'u'}));
test('Admin global scope',()=>assert.deepEqual(reportScope({id:'u',role:'admin'}),{userId:null}));