import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {basketOffer,orderOffer,physicalCount,basketProblem,summaryText,extras,productStats,quantityLabel,combinationStats,type Product,type OrderItem,type Proposal,type ActivityCall} from '../src/index.js';
const catalogue=JSON.parse(readFileSync(new URL('./fixtures/catalogue.json',import.meta.url),'utf8')) as Product[];
const item=(id:string,quantity=1):OrderItem=>({...catalogue.find(p=>p.id===id)!,quantity});

describe('ordered quantities',()=>{
 it('prices repeated units without rounding each unit and keeps an unchanged order at catalogue price',()=>{
  expect(orderOffer([item('antiacne',2)],[item('antiacne',2)],'duo',catalogue)).toBe(3600);
  expect(orderOffer([item('antiacne')],[item('antiacne',2)],'catalogue',catalogue)).toBe(3600);
  expect(basketOffer([item('antiacne',2)],'duo',catalogue)).toBe(3300);
  expect(basketOffer([item('antiacne',2)],'final',catalogue)).toBe(3000);
  expect(basketOffer([item('antiacne',2),item('wcgel',3)],'duo',catalogue)).toBe(7400);
 });
 it('multiplies the protected pack tariff and counts every physical unit',()=>{
  const basket=[item('packpousse',2),item('antiacne',2)];
  expect(basketOffer(basket,'duo',catalogue)).toBe(9800);
  expect(basketOffer(basket,'final',catalogue)).toBe(9500);
  expect(physicalCount(basket,catalogue)).toBe(6);
  expect(basketProblem(basket,catalogue)).toBeNull();
  expect(basketProblem([item('packpousse',2),item('shpousse')],catalogue)).toBeTruthy();
 });
 it('shows quantities, unit prices, line totals and the correct original value in the copied offer',()=>{
  const text=summaryText(item('antiacne'),[item('antiacne',3)],'catalogue',400,catalogue,[item('antiacne',2)]);
  expect(text).toContain('Sérum Anti-Acné × 2');
  expect(text).toContain('Sérum Anti-Acné × 3 : 5\u202f400 DA');
  expect(text).toContain('1\u202f800 DA / unité');
  expect(text).toContain('Écart avec la commande initiale : 1\u202f800 DA');
  expect(text).toContain('Total avec livraison : 5\u202f800 DA');
 });
 it('counts only additional units of a product already in the original order',()=>{
  const original={id:'antiacne',name:'Anti-Acné',price:1800,quantity:2};
  const p:Proposal={id:'p',call_id:'c',user_id:'u',created_at:'2026-11-18T11:00:00Z',base:original,originals:[original],products:[{...original,quantity:5}],catalogueTotal:9000,offerTotal:9000,extra:5400,tier:'catalogue',delivery:null,version:3};
  const c:ActivityCall={id:'c',user_id:'u',operator:'QA',created_at:p.created_at,outcome:'routine',base_id:'antiacne',products:p.products,base_total:3600,catalogue_total:9000,offered_total:9000,extra:5400,delivery:null,tier:'catalogue',pilot:1,refusal:'',meta:{version:3,acceptedProposalId:'p',originals:[original]},proposals:[p]};
  expect(extras(p)).toEqual([{...original,quantity:3}]);
  expect(productStats([c])[0]).toMatchObject({units:3,accepted:1,proposed:1});
  expect(combinationStats([c])[0].name).toBe('Anti-Acné × 2 → Anti-Acné × 3');
  expect(quantityLabel({...original,quantity:undefined})).toBe('Anti-Acné');
 });
});
