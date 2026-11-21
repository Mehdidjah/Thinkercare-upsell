import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BEL_CONCERNS,BEL_PATHS,BEL_TARGETED,EMPTY_PROFILE,basketOffer,basketProblem,brandProblem,hairPackSets,manualAddCheck,money,orderOffer,packUpgrades,pricedTotal,recommend,summaryText,type OrderItem,type Product,type Profile,type Tier} from '../src/index.js';
const load=(f:string)=>JSON.parse(readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8')) as Product[];
// The live BEL.NCO catalogue since 0010: the « Pack Cleansing » is back under the ritual's id, the prickly pear oil is gone (0008).
const touche=load('catalogue.json'),bel=load('belnco.json').filter(p=>p.id!=='bel-pear'),all=[...touche,...bel];
const get=(id:string)=>all.find(p=>p.id===id)!;
const item=(id:string,quantity=1):OrderItem=>({...get(id),quantity});
const tiers:Tier[]=['catalogue','duo','final'];
const ready:Profile={...EMPTY_PROFILE,skin:'normal',sensitive:'no',routineKnown:true,routine:[],safety:['none'],makeup:'none',retinol:'tolerated'};
const PACK='« Pack Cleansing : Cleansing Oil + Cleansing Gel »';

describe('BEL.NCO « Pack Cleansing » (0010)',()=>{
 it('is the Cleansing Oil with the Cleansing Gel, 3 100 DA, on and suggested, with its photo',()=>{
  expect(get('bel-ritual')).toMatchObject({name:'Pack Cleansing : Cleansing Oil + Cleansing Gel',short:'Pack Cleansing',brand:'belnco',category:'Pack',components:['bel-oil','bel-gel'],price:3100,size:'2 × 250 ml',image:'/assets/products/bel-ritual.webp',enabled:true,recommendable:true});
  expect(existsSync(new URL('../../frontend/public/assets/products/bel-ritual.webp',import.meta.url))).toBe(true);
  // Double cleansing, in French: the oil on dry skin, then the gel on wet skin.
  const p=get('bel-ritual');
  expect(p.description).toBe('Le Pack Cleansing : la Centella Cleansing Oil, sur peau sèche, puis le Centella Cleansing Gel, sur peau mouillée, à 3 100 DA au lieu de 3 400 DA à l’unité.');
  expect(p.pitch).toBe('Le double nettoyage en un pack : l’huile démaquille sur peau sèche, puis le gel nettoie sur peau mouillée.');
  expect(p.usage).toBe('L’huile sur peau sèche, émulsionnée avec un peu d’eau puis rincée ; ensuite le gel sur peau mouillée, rincé à l’eau tiède.');
  // The owner fixed its content and price: nothing is left « à confirmer ».
  expect(JSON.stringify(p)).not.toMatch(/à confirmer|déduite/);
 });
 it('is the pack upgrade of an oil or a gel order, with its pitch; no other BEL.NCO product gets it',()=>{
  for(const id of ['bel-oil','bel-gel'])expect(packUpgrades(all,get(id),{...ready,concerns:['dull']}).map(c=>[c.product.id,c.reason]),id).toEqual([['bel-ritual',get('bel-ritual').pitch]]);
  for(const id of ['bel-spf30','bel-clarifying','bel-retinol','bel-moist','bel-uv50'])expect(packUpgrades(all,get(id),{...ready,concerns:['dull']}),id).toEqual([]);
  // Replacing the oil by the pack: 1 700 DA becomes 3 100 DA at every price level.
  expect(tiers.map(t=>orderOffer([item('bel-oil')],[item('bel-ritual')],t,all))).toEqual([3100,3100,3100]);
 });
 it('the oil and the gel chosen separately cost the pack price at every level, and the recap names the pack rate',()=>{
  const basket=[item('bel-oil'),item('bel-gel')];
  expect(hairPackSets(basket,all)).toEqual({sets:[{pack:get('bel-ritual'),count:1}],rest:[]});
  expect(pricedTotal(basket,all)).toBe(3100);
  expect(tiers.map(t=>basketOffer(basket,t,all))).toEqual([3100,3100,3100]);
  expect(tiers.map(t=>orderOffer([item('bel-oil')],basket,t,all))).toEqual([3100,3100,3100]);
  expect(summaryText(get('bel-oil'),basket,'duo',null,all,[item('bel-oil')])).toContain(`Tarif pack appliqué : Centella Cleansing Oil + Centella Cleansing Gel = ${money(3100)}.`);
 });
 it('never twice and never together: not beside its oil or gel; the retinol and the acid serum still exclude each other',()=>{
  for(const id of ['bel-oil','bel-gel'])expect(basketProblem([item('bel-ritual'),item(id)],all),id).toBe('Un produit est déjà inclus dans le pack ou la routine.');
  expect(basketProblem([item('bel-ritual'),item('bel-retinol')],all)).toBeNull();
  expect(basketProblem([item('bel-ritual'),item('bel-retinol'),item('bel-clarifying')],all)).toBe(`${get('bel-retinol').short} et ${get('bel-clarifying').short} ne s’utilisent jamais dans la même routine : gardez l’un ou l’autre.`);
  // A manual add of the pack beside its own oil is refused.
  expect(manualAddCheck(get('bel-oil'),[],get('bel-ritual'),{...ready,concerns:['dull']},all).blocked).not.toBeNull();
 });
 it('BEL.NCO only: a Touché call refuses it, a BEL.NCO call refuses a Touché pack, and no Touché product is upgraded to it',()=>{
  expect(brandProblem([get('bel-ritual')],'touche',all)).toBe(`${PACK} est une référence BEL.NCO : un appel Touché ne propose que des références Touché.`);
  expect(brandProblem([get('bel-ritual')],'belnco',all)).toBeNull();
  expect(brandProblem([get('packpousse')],'belnco',all)).toBe(`« ${get('packpousse').name} » est une référence Touché : un appel BEL.NCO ne propose que des références BEL.NCO.`);
  const face:Profile={...ready,concerns:['dull'],makeup:''};
  for(const p of touche.filter(p=>p.enabled&&p.category!=='Pack'))expect(packUpgrades(all,p,face).map(c=>c.product.id),p.id).not.toContain('bel-ritual');
 });
 it('the prickly pear oil left in the pairings and targeted care changes no live suggestion: they are kept',()=>{
  const live=bel.filter(p=>p.enabled&&p.category!=='Pack');
  const run=()=>live.flatMap(base=>BEL_CONCERNS.map(([c])=>recommend(all,base,{...ready,concerns:[c],severity:c==='acne'?'mild':'',marks:c==='marks'?'flat':'',redState:c==='red'?'mild':''}).map(r=>r.product.id).join(',')));
  const before=run(),saved={paths:{...BEL_PATHS},targeted:{...BEL_TARGETED}};
  try{
   for(const k of Object.keys(BEL_PATHS))BEL_PATHS[k]=BEL_PATHS[k].filter(id=>id!=='bel-pear');
   for(const k of Object.keys(BEL_TARGETED))BEL_TARGETED[k]=BEL_TARGETED[k].filter(id=>id!=='bel-pear');
   expect(run()).toEqual(before);
  }finally{Object.assign(BEL_PATHS,saved.paths);Object.assign(BEL_TARGETED,saved.targeted);}
 });
});
