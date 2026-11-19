import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'vitest';
import * as c from '../src/index.js';
const catalogue:any[]=JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue.json',import.meta.url),'utf8'));
const p=(id:string)=>catalogue.find(x=>x.id===id);
const skin={...c.EMPTY_PROFILE,concerns:['acne'],skin:'mixed',sensitive:'no',routineKnown:true,routine:[],safety:['none'],severity:'mild'};
const ids=(q:string)=>[...c.searchIds(catalogue,q)];

test('each stop reason has its own customer script',()=>{
 const stops=[{...skin,safety:['urgent']},{...skin,safety:['irritation']},{...skin,severity:'severe'},{...skin,concerns:['fall'],hairPattern:'patchy'},{...skin,safety:['minor'],age:'child'},{...skin,safety:['allergy'],allergens:['unknown']}].map(q=>c.reviewStop(q)!);
 assert.deepEqual(stops.map(s=>s.code),c.REVIEW_SITUATIONS.map(([code])=>code));
 assert.equal(new Set(stops.map(s=>s.script)).size,stops.length);
 assert.match(stops[0].script,/secours/);assert.equal(stops[0].urgent,true);
 assert.doesNotMatch(stops[4].script,/médical/);assert.doesNotMatch(stops[5].script,/médical/);
 for(const s of stops)assert.equal(c.reviewReason({...skin,...{}})??null,null);
 assert.equal(c.reviewReason({...skin,safety:['urgent']}),stops[0].text);
});

test('an offer that does not raise the order is refused (3 × SPF serum + gel at the final price)',()=>{
 const initial=[{...p('serumspf'),quantity:3}],basket=[...initial,{...p('wcgel'),quantity:1}];
 assert.equal(c.orderOffer(initial,basket,'final'),8500);
 assert.match(c.offerProblem(initial,basket,'final')!,/ne dépasse pas la commande initiale/);
 assert.equal(c.offerProblem(initial,basket,'catalogue'),null);
 assert.equal(c.offerProblem(initial,initial,'final'),null);
 assert.equal(c.offerProblem([p('antiacne')],[p('antiacne'),p('wcgel')],'final'),null);
});

test('a product ordered with a pack that contains it is reported',()=>{
 const dup=c.packDuplicate([p('shpousse'),p('packpousse')],catalogue);
 assert.equal(dup?.pack.id,'packpousse');assert.equal(dup?.product.id,'shpousse');
 assert.equal(c.packDuplicate([p('antiacne'),p('wcgel')],catalogue),null);
});

test('search understands what customers say',()=>{
 for(const q of ['crème solaire','écran','spf50','SPF 50','ecran total'])assert.ok(ids(q).includes('wcspf'),q);
 assert.ok(ids('crème solaire').every(id=>p(id).category==='Protection solaire'||/solaire|spf/i.test(p(id).name+p(id).description)),'only sun products');
 for(const id of ['shpousse','shanti','shpso'])assert.ok(ids('shampooing').includes(id),id);
 assert.ok(ids('anti chute').includes('shanti'));assert.ok(ids('anti-chute').includes('serumhair'));
 assert.ok(ids('bouton').includes('antiacne'));assert.ok(ids('crème').includes('wccream'));
 assert.deepEqual(ids(''),catalogue.map(x=>x.id));
 assert.ok(ids('glycérine').length>0,'description fallback');
 assert.equal(ids('zzzz').length,0);
 assert.ok(c.closestProducts(catalogue,'crème zzzz').length>0);
});

test('CSV keeps numbers numeric for French Excel and guards text formulas',()=>{
 assert.equal(c.escapeCSV(33.333333333333336),'"33,33"');
 assert.equal(c.escapeCSV(-500),'"-500"');
 assert.equal(c.escapeCSV('-500'),'"\'-500"');
 assert.ok(c.csv([['a']]).startsWith('﻿'));
 assert.ok(!c.csv([['a']]).startsWith('﻿﻿'));
});

test('voided calls are kept but not counted',()=>{
 const calls=[{voided_at:null},{voided_at:'2026-11-19T10:00:00Z'},{}] as any[];
 assert.equal(c.countedCalls(calls).length,2);
});

test('open callbacks count stop-panel callbacks recorded as review with a date',()=>{
 const call=(outcome:string,meta:any={},done=0)=>({id:outcome,user_id:'u',operator:'U',created_at:'2026-11-19T10:00:00Z',outcome,base_id:'antiacne',products:[],catalogue_total:0,base_total:0,offered_total:0,extra:0,delivery:null,tier:'catalogue',pilot:0,refusal:'',meta,proposals:[],callback_done:done}) as any;
 assert.equal(c.summary([call('callback'),call('review',{callbackAt:'2026-11-20T10:00:00Z'}),call('review'),call('callback',{},1)]).callback,2);
});
