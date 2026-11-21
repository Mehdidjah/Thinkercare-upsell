// Commission estimates only. No payroll transfer, delivery or collection is inferred.
import {BRANDS,type Brand} from './brands.js';
export type BonusMode='pending'|'all_month'|'from_threshold';
export type BonusRule={effectiveMonth:string;threshold:number;rateDzd:number;mode:BonusMode;version:number};
export const DEFAULT_BONUS:BonusRule={effectiveMonth:'',threshold:60,rateDzd:45,mode:'pending',version:0};
export function validMonth(m:string):boolean{return /^20\d{2}-(0[1-9]|1[0-2])$/.test(m);}
export function algerDay(value:string|Date=new Date()):string {
 const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('Date invalide');
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Algiers',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 return ['year','month','day'].map(k=>p.find(x=>x.type===k)!.value).join('-');
}
export function monthBounds(month:string){
 if(!validMonth(month))throw new Error('Mois invalide');
 const [y,m]=month.split('-').map(Number),next=new Date(Date.UTC(y,m,1,12)).toISOString().slice(0,10),last=new Date(Date.UTC(y,m,0,12)).toISOString().slice(0,10);
 return {from:month+'-01',to:last,startUtc:new Date(month+'-01T00:00:00+01:00').toISOString(),endUtc:new Date(next+'T00:00:00+01:00').toISOString()};
}
export function bonusEstimate(count:number,rule:BonusRule){
 if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(rule.threshold)||rule.threshold<1||!Number.isSafeInteger(rule.rateDzd)||rule.rateDzd<0)throw new Error('Paramètres de prime invalides');
 const reached=count>=rule.threshold,remaining=Math.max(0,rule.threshold-count);
 const payableCount=rule.mode==='pending'?null:!reached?0:rule.mode==='all_month'?count:count-rule.threshold+1;
 return {count,threshold:rule.threshold,rateDzd:rule.rateDzd,mode:rule.mode,reached,remaining,progress:Math.min(100,count/rule.threshold*100),payableCount,estimatedDzd:payableCount===null?null:payableCount*rule.rateDzd};
}
/** One adviser's day. `upsells_touche` and `upsells_belnco` split `upsells` by the brand of the call. */
export type ContributionRow={user_id:string;day:string;calls:number;confirmations:number;upsells:number;initial_dzd:number;confirmed_dzd:number;uplift_dzd:number;without_ref:number;duplicates:number}&{[B in Brand as `upsells_${B}`]:number};
const perBrand=(count:(b:Brand)=>number)=>Object.fromEntries(BRANDS.map(b=>[b,count(b)])) as Record<Brand,number>;
export const emptyContribution=()=>({calls:0,confirmations:0,upsells:0,upsellsByBrand:perBrand(()=>0),initialDzd:0,confirmedDzd:0,upliftDzd:0,withoutRef:0,duplicates:0});
export function sumContributions(rows:ContributionRow[]){return rows.reduce((a,r)=>({calls:a.calls+Number(r.calls),confirmations:a.confirmations+Number(r.confirmations),upsells:a.upsells+Number(r.upsells),upsellsByBrand:perBrand(b=>a.upsellsByBrand[b]+Number(r[`upsells_${b}`])),initialDzd:a.initialDzd+Number(r.initial_dzd),confirmedDzd:a.confirmedDzd+Number(r.confirmed_dzd),upliftDzd:a.upliftDzd+Number(r.uplift_dzd),withoutRef:a.withoutRef+Number(r.without_ref),duplicates:a.duplicates+Number(r.duplicates)}),emptyContribution());}
export { canManageWorkspace as canViewDirection } from './access.js';
