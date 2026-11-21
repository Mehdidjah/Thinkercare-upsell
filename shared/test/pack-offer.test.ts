import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {basketOffer,brandOf,hairPackSets,isPack,orderOffer,packPricing,summaryText,type OrderItem,type Product,type Tier} from '../src/index.js';
// 2026-11-21, the owner: a pack's price is already a promotion, so an offer made of packs only has no 2nd or 3rd price.
const load=(f:string)=>JSON.parse(readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8')) as Product[];
// Both brands as they are sold today: the BEL.NCO « Pack Cleansing » (0010), no prickly pear oil (0008).
const all=[...load('catalogue.json'),...load('belnco.json').filter(p=>p.id!=='bel-pear')];
const get=(id:string)=>all.find(p=>p.id===id)!;
const item=(id:string,quantity=1):OrderItem=>({...get(id),quantity});
const tiers:Tier[]=['catalogue','duo','final'];
const levels=(initial:OrderItem[],basket:OrderItem[])=>tiers.map(t=>orderOffer(initial,basket,t,all));
const packs=all.filter(isPack);
/** Packs whose products chosen one by one cost the pack (pairPack): the hair packs and the BEL.NCO pack. */
const setPacks=packs.filter(p=>hairPackSets((p.components??[]).map(id=>item(id)),all).sets.some(s=>s.pack.id===p.id));
const one=(xs:number[])=>new Set(xs).size===1;

describe('an offer made of packs only is one amount at every price level (checked before any screen change)',()=>{
 it('finds the set-priced packs of both brands',()=>expect(setPacks.map(p=>p.id)).toEqual(['packpousse','packanti','packpso','bel-ritual']));
 it('a product replaced by its pack, one unit or more',()=>{
  for(const pack of packs.filter(p=>p.components?.length))for(const id of pack.components!)for(const q of [1,2]){
   const l=levels([item(id,q)],[item(pack.id,q)]);
   expect(one(l),`${id}×${q} → ${pack.id}: ${l}`).toBe(true);
  }
 });
 it('a pack added to a pack of the same brand, or more units of a pack',()=>{
  for(const a of packs)for(const b of packs.filter(p=>brandOf(p)===brandOf(a))){
   const l=a.id===b.id?levels([item(a.id)],[item(a.id,2)]):levels([item(a.id)],[item(a.id),item(b.id)]);
   expect(one(l),`${a.id} + ${b.id}: ${l}`).toBe(true);
  }
 });
 it('a set-priced pack’s products chosen one by one, one set or two',()=>{
  for(const pack of setPacks){
   const [first,...others]=pack.components!;
   for(const q of [1,2]){
    const l=levels([item(first,q)],[item(first,q),...others.map(id=>item(id,q))]);
    expect(l,`${pack.id}×${q}`).toEqual([pack.price*q,pack.price*q,pack.price*q]);
   }
  }
 });
 it('beside another product, the 2nd and 3rd levels still discount that product: the levels differ',()=>{
  expect(levels([item('bel-oil')],[item('bel-ritual'),item('bel-moist')])).toEqual([4750,4600,4500]);
  expect(levels([item('bel-oil')],[item('bel-oil'),item('bel-gel'),item('bel-moist')])).toEqual([4750,4600,4500]);
  expect(one(levels([item('antiacne')],[item('antiacne'),item('packpousse')]))).toBe(false);
  // A set and one more unit of a component: that unit is discounted.
  expect(one(levels([item('shpousse',2)],[item('shpousse',2),item('conditioner')]))).toBe(false);
  expect(basketOffer([item('bel-ritual')],'final',all)).toBe(3100);
 });
});

describe('packPricing: what packs make of the offer',()=>{
 it('« pack » when every line is priced as a pack: pack lines, or a set-priced pack’s products chosen one by one',()=>{
  for(const basket of [[item('bel-ritual')],[item('bel-ritual',2)],[item('bel-oil'),item('bel-gel')],[item('packpousse'),item('packanti')],[item('shpousse',2),item('conditioner',2)],[item('bodypack')],[item('packjunior'),item('packpso')]])
   expect(packPricing(basket,all),basket.map(p=>p.id).join('+')).toBe('pack');
 });
 it('« mixed » when a pack sits beside other products, which alone take the 2nd and 3rd offers’ discount',()=>{
  for(const basket of [[item('bel-ritual'),item('bel-moist')],[item('bel-oil'),item('bel-gel'),item('bel-moist')],[item('antiacne'),item('packpousse')],[item('shpousse',2),item('conditioner')]])
   expect(packPricing(basket,all),basket.map(p=>p.id).join('+')).toBe('mixed');
 });
 it('none without a pack: the body duo’s products chosen one by one are not priced as their pack',()=>{
  for(const basket of [[item('antiacne'),item('wcgel')],[item('bodywash'),item('nia10')],[item('bel-retinol'),item('bel-moist')],[]])
   expect(packPricing(basket,all),basket.map(p=>p.id).join('+')).toBeNull();
 });
 it('agrees with the amounts: an offer it calls « pack » is one amount at every level',()=>{
  for(const a of packs)for(const b of [...packs,...all.filter(p=>!isPack(p)&&p.enabled)].filter(p=>brandOf(p)===brandOf(a))){
   const basket=a.id===b.id?[item(a.id,2)]:[item(a.id),item(b.id)],l=levels([item(a.id)],basket);
   if(packPricing(basket,all)==='pack')expect(new Set(l).size,`${a.id} + ${b.id}: ${l}`).toBe(1);
   else expect(packPricing(basket,all),`${a.id} + ${b.id}`).toBe('mixed');
  }
 });
});

describe('the recap of a pack-only offer names no 2nd or 3rd offer',()=>{
 const PACK_ONLY='Prix du pack déjà promotionnel, sans autre remise.',MIXED='Tarif pack conservé, réduction uniquement sur les compléments éligibles.';
 const recap=(initial:OrderItem[],basket:OrderItem[],tier:Tier)=>summaryText(initial[0],basket,tier,null,all,initial);
 it('a pack upgrade, a pack added or the pack’s products one by one: « Prix du pack déjà promotionnel, sans autre remise. »',()=>{
  for(const [initial,basket] of [[[item('bel-oil')],[item('bel-ritual')]],[[item('bel-gel')],[item('bel-gel'),item('bel-oil')]],[[item('shpousse')],[item('packpousse')]],[[item('packanti')],[item('packanti'),item('packpousse')]]] as OrderItem[][][])for(const tier of tiers){
   const text=recap(initial,basket,tier);
   expect(text,basket.map(p=>p.id).join('+')).toContain(PACK_ONLY);
   expect(text).not.toContain(MIXED);
   expect(text).not.toMatch(/2e|3e|deuxième|troisième|première offre|offre finale|palier/i);
  }
 });
 it('a pack beside other products keeps « Tarif pack conservé, réduction uniquement sur les compléments éligibles. »; no pack, neither line',()=>{
  expect(recap([item('bel-oil')],[item('bel-ritual'),item('bel-moist')],'duo')).toContain(MIXED);
  expect(recap([item('bel-oil')],[item('bel-ritual'),item('bel-moist')],'duo')).not.toContain(PACK_ONLY);
  const plain=recap([item('antiacne')],[item('antiacne'),item('wcgel')],'duo');
  expect(plain).not.toContain(MIXED);
  expect(plain).not.toContain(PACK_ONLY);
 });
});
