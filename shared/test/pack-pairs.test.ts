import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {basketOffer,orderOffer,offerProblem,pricedTotal,hairPackSets,summaryText,salesPitch,objections,money,EMPTY_PROFILE,type Product,type OrderItem,type Tier} from '../src/index.js';
// Hair-pack pair pricing (docs/superpowers/specs/2026-11-19-hair-pack-pair-pricing-design.md), real catalogue prices.
const catalogue=JSON.parse(readFileSync(new URL('./fixtures/catalogue.json',import.meta.url),'utf8')) as Product[];
const get=(id:string)=>catalogue.find(p=>p.id===id)!;
const item=(id:string,quantity=1):OrderItem=>({...get(id),quantity});
const tiers:Tier[]=['catalogue','duo','final'];
const offers=(basket:OrderItem[],list=catalogue)=>tiers.map(t=>basketOffer(basket,t,list));
const listTotal=(basket:OrderItem[])=>basket.reduce((s,p)=>s+p.price*(p.quantity??1),0);
const hair={...EMPTY_PROFILE,concerns:['growth','breakage'],skin:'mixed',sensitive:'no',routineKnown:true,routine:[],safety:['none']};

describe('hair-pack products chosen separately',()=>{
 it('finds only the three hair packs whose components are listed (not the body duo, not Junior)',()=>{
  const singles=catalogue.filter(p=>p.category!=='Pack').map(p=>item(p.id));
  expect(hairPackSets(singles,catalogue).sets.map(s=>[s.pack.id,s.count])).toEqual([['packpousse',1],['packanti',1],['packpso',1]]);
 });
 it.each([
  ['shpousse','conditioner','packpousse',3600,3250],
  ['shanti','serumhair','packanti',3800,2950],
  ['shpso','serumpso','packpso',3700,3450],
 ])('prices %s + %s as %s in every tier',(a,b,pack,list,price)=>{
  const basket=[item(a),item(b)];
  expect(listTotal(basket)).toBe(list);
  expect(hairPackSets(basket,catalogue)).toEqual({sets:[{pack:get(pack),count:1}],rest:[]});
  expect(pricedTotal(basket,catalogue)).toBe(price);
  expect(offers(basket)).toEqual([price,price,price]);
  expect(offers([item(b),item(a)])).toEqual([price,price,price]);
 });
 it('keeps the body pair at the usual discount: 3650 / 3400 / 3000',()=>{
  const basket=[item('bodywash'),item('nia10')];
  expect(hairPackSets(basket,catalogue)).toEqual({sets:[],rest:basket});
  expect(pricedTotal(basket,catalogue)).toBe(3650);
  expect(offers(basket)).toEqual([3650,3400,3000]);
 });
 it('protects the pair and discounts only a third single, with one final rounding: 5150 / 5000 / 4900',()=>{
  const basket=[item('shpousse'),item('conditioner'),item('serumhair')];
  expect(listTotal(basket)).toBe(5500);
  expect(hairPackSets(basket,catalogue)).toEqual({sets:[{pack:get('packpousse'),count:1}],rest:[item('serumhair')]});
  expect(offers(basket)).toEqual([5150,5000,4900]);
  // Exactly what the official pack plus the same single costs.
  expect(offers([item('packpousse'),item('serumhair')])).toEqual([5150,5000,4900]);
 });
 it('does not treat a pack line as a component and keeps it in the rest',()=>{
  const basket=[item('packpousse'),item('shanti'),item('serumhair')];
  expect(hairPackSets(basket,catalogue)).toEqual({sets:[{pack:get('packanti'),count:1}],rest:[item('packpousse')]});
  expect(offers(basket)).toEqual([6200,6200,6200]);
 });
 it('counts sets by the smallest quantity and prices the leftovers as singles',()=>{
  const one=[item('shpousse',2),item('conditioner')];
  expect(listTotal(one)).toBe(5500);
  expect(hairPackSets(one,catalogue)).toEqual({sets:[{pack:get('packpousse'),count:1}],rest:[item('shpousse',1)]});
  expect(pricedTotal(one,catalogue)).toBe(5150);
  expect(offers(one)).toEqual([5150,5000,4900]);
  const two=[item('shpousse',2),item('conditioner',2)];
  expect(listTotal(two)).toBe(7200);
  expect(hairPackSets(two,catalogue)).toEqual({sets:[{pack:get('packpousse'),count:2}],rest:[]});
  expect(offers(two)).toEqual([6500,6500,6500]);
  expect(summaryText(two[0],two,'duo',null,catalogue,two)).toContain(`= ${money(3250)} × 2 = ${money(6500)}.`);
 });
 it('follows the pack price of the catalogue it is given',()=>{
  const edited=catalogue.map(p=>p.id==='packpousse'?{...p,price:3100}:p);
  const basket=[item('shpousse'),item('conditioner')];
  expect(pricedTotal(basket,edited)).toBe(3100);
  expect(offers(basket,edited)).toEqual([3100,3100,3100]);
 });
 it('rejects an invalid amount, including the pack price read from the catalogue',()=>{
  const broken=catalogue.map(p=>p.id==='packpousse'?{...p,price:Number.NaN}:p);
  for(const t of tiers){
   expect(()=>basketOffer([item('shpousse'),item('conditioner')],t,broken)).toThrow(/Montant invalide/);
   expect(()=>basketOffer([item('shpousse'),{...item('conditioner'),price:1700.5}],t,catalogue)).toThrow(/Montant invalide/);
  }
 });
});

describe('initial orders containing a hair-pack pair',()=>{
 it('values the initial pair at the pack price and keeps it there while unchanged',()=>{
  const initial=[item('shpousse'),item('conditioner')];
  expect(pricedTotal(initial,catalogue)).toBe(3250);
  for(const t of tiers)expect(orderOffer(initial,initial,t,catalogue)).toBe(3250);
  for(const t of tiers)expect(orderOffer(initial,[...initial].reverse(),t,catalogue)).toBe(3250);
  const text=summaryText(initial[0],initial,'duo',null,catalogue,initial);
  expect(text).toContain(`Commande initiale : ${get('shpousse').name} + ${get('conditioner').name} (${money(3250)}).`);
  expect(text).toContain(`Total catalogue : ${money(3600)}`);
  expect(text).toContain('Écart avec la commande initiale : 0 DA');
 });
 it('values frozen snapshots the same way as catalogue lines',()=>{
  const snapshots=[{id:'shpousse',name:'Shampooing',price:1900,quantity:1,category:'Shampoing'},{id:'conditioner',name:'Après-shampooing',price:1700,quantity:1,category:'Après-shampoing'}];
  expect(pricedTotal(snapshots,catalogue)).toBe(3250);
  // Singles keep their frozen price; a set takes the pack price of the catalogue given.
  expect(pricedTotal([...snapshots,{id:'serumhair',name:'Sérum',price:1500,quantity:1,category:'Soin cuir chevelu'}],catalogue)).toBe(4750);
 });
 it('adds 1 350 DA in every tier when the conditioner completes an initial shampoo, and the offer is accepted',()=>{
  const initial=[item('shpousse')],basket=[item('shpousse'),item('conditioner')];
  expect(pricedTotal(initial,catalogue)).toBe(1900);
  for(const t of tiers){
   expect(orderOffer(initial,basket,t,catalogue)-pricedTotal(initial,catalogue)).toBe(1350);
   expect(offerProblem(initial,basket,t,catalogue)).toBeNull();
  }
  const text=summaryText(initial[0],basket,'final',400,catalogue,initial);
  expect(text).toContain(`Tarif pack appliqué : ${get('shpousse').name} + ${get('conditioner').name} = ${money(3250)}.`);
  expect(text).toContain(`Total catalogue : ${money(3600)}`);
  expect(text).toContain(`Offre produits : ${money(3250)}`);
  expect(text).toContain(`Économie : ${money(350)}`);
  expect(text).toContain(`Écart avec la commande initiale : ${money(1350)}`);
  expect(text).toContain(`Total avec livraison : ${money(3650)}`);
  expect(salesPitch(initial[0],basket,hair,'final',catalogue,initial).price).toContain(`${money(3250)} au lieu de ${money(3600)}, soit ${money(1350)} supplémentaires`);
  expect(objections(initial[0],basket,hair,'duo',catalogue,initial)[0].answer).toContain(`Votre commande de départ est à ${money(1900)} ; avec cette composition, on passe à ${money(3250)}. Le supplément réel est donc ${money(1350)}`);
 });
 it('uses the pack value of an initial pair for the uplift of an added single',()=>{
  const initial=[item('shpousse'),item('conditioner')],basket=[...initial,item('serumhair')];
  expect(orderOffer(initial,basket,'duo',catalogue)).toBe(5000);
  expect(salesPitch(initial[0],basket,hair,'duo',catalogue,initial).price).toContain(`soit ${money(1750)} supplémentaires`);
  expect(objections(initial[0],basket,hair,'duo',catalogue,initial)[0].answer).toContain(`Votre commande de départ est à ${money(3250)}`);
 });
 it('checks an add-on against the pack value of the initial order (M5)',()=>{
  // A 300 DA complement on an initial pair: 3 500 DA at the final price, above the 3 250 DA pack value (not the 3 600 DA list sum).
  const cheap=catalogue.map(p=>p.id==='hcream'?{...p,price:300}:p),take=(id:string):OrderItem=>({...cheap.find(p=>p.id===id)!,quantity:1});
  const initial=[take('shpousse'),take('conditioner')],basket=[...initial,take('hcream')];
  expect(orderOffer(initial,basket,'final',cheap)).toBe(3500);
  expect(offerProblem(initial,basket,'final',cheap)).toBeNull();
  // An initial pair + serum (5 150 DA at its pack value): the same complement brings it to 5 100 DA, refused with that value.
  const withSerum=[...initial,take('serumhair')];
  expect(orderOffer(withSerum,[...withSerum,take('hcream')],'final',cheap)).toBe(5100);
  expect(offerProblem(withSerum,[...withSerum,take('hcream')],'final',cheap)).toBe(`À ce niveau de prix, l’offre (${money(5100)}) ne dépasse pas la commande initiale (${money(5150)}) : choisissez un autre prix ou ajoutez un produit.`);
 });
});

describe('documented offers stay unchanged',()=>{
 it.each([
  [['antiacne','wcgel'],3300,3000,2700],
  [['antiacne','wcgel','wcspf'],4800,4400,4000],
  [['packpousse'],3250,3250,3250],
  [['packanti','conditioner'],4650,4500,4400],
 ] as [string[],number,number,number][])('%s: %i / %i / %i',(ids,catalogueTotal,first,final)=>{
  const basket=ids.map(id=>item(id));
  expect(offers(basket)).toEqual([catalogueTotal,first,final]);
  expect(summaryText(basket[0],basket,'duo',null,catalogue,[basket[0]])).not.toContain('Tarif pack appliqué');
 });
});
