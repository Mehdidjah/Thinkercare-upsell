import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {EMPTY_PROFILE,basketProblem,brandProblem,canCombine,domainOf,manualAddCheck,packUpgrades,recommend,type Product,type Profile} from '../src/index.js';
const load=(f:string)=>JSON.parse(readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8')) as Product[];
const touche=load('catalogue.json'),bel=load('belnco.json'),all=[...touche,...bel];
const get=(id:string)=>all.find(p=>p.id===id)!;
const ready={...EMPTY_PROFILE,sensitive:'no',routineKnown:true,routine:[],safety:['none']};
const face:Profile={...ready,concerns:['acne'],severity:'mild',skin:'mixed'};
const dry:Profile={...ready,concerns:['dry'],skin:'dry'};
const hair:Profile={...ready,concerns:['growth','breakage'],skin:'mixed'};
const body:Profile={...ready,concerns:['bodyspots'],skin:'normal'};
const NEVER='Retinol Complex Serum et Clarifying Serum ne s’utilisent jamais dans la même routine : gardez l’un ou l’autre.';

describe('BEL.NCO rows never change a Touché call',()=>{
 it.each(touche.filter(p=>p.enabled).map(p=>p.id))('%s: same suggestions and pack upgrades',id=>{
  const base=get(id),profiles=domainOf(base)==='hair'?[hair]:domainOf(base)==='body'?[body]:[face,dry];
  for(const p of profiles){
   expect(recommend(all,base,p)).toEqual(recommend(touche,base,p));
   expect(packUpgrades(all,base,p)).toEqual(packUpgrades(touche,base,p));
  }
 });
 it('a BEL.NCO base is only offered BEL.NCO products',()=>{
  const ids=recommend(all,get('bel-moist'),{...ready,concerns:['dehydration'],skin:'normal'}).map(c=>c.product.id);
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.every(id=>id.startsWith('bel-'))).toBe(true);
 });
 it('a manual add of the other brand is blocked, both ways',()=>{
  expect(manualAddCheck(get('antiacne'),[],get('bel-moist'),face,all).blocked).toBe('Référence BEL.NCO : elle ne s’ajoute pas à un appel Touché.');
  expect(manualAddCheck(get('bel-retinol'),[],get('wcgel'),face,all).blocked).toBe('Référence Touché : elle ne s’ajoute pas à un appel BEL.NCO.');
 });
 it('brandProblem names the first reference of another brand, a pack before its components',()=>{
  expect(brandProblem([get('antiacne'),get('wcgel')],'touche',all)).toBeNull();
  expect(brandProblem([get('antiacne'),get('bel-moist')],'touche',all)).toBe('« RICH MOISTURIZER » est une référence BEL.NCO : un appel Touché ne propose que des références Touché.');
  expect(brandProblem([get('bel-ritual')],'touche',all)).toBe('« DOUBLE cleansing ritual » est une référence BEL.NCO : un appel Touché ne propose que des références Touché.');
  expect(brandProblem([get('antiacne')],'belnco',all)).toBe('« Sérum Anti-Acné » est une référence Touché : un appel BEL.NCO ne propose que des références BEL.NCO.');
 });
});

describe('Retinol Complex Serum and Clarifying Serum are never together',()=>{
 it('basketProblem refuses them in any order, through a pack, and when only one side lists the rule',()=>{
  expect(basketProblem([get('bel-retinol'),get('bel-clarifying')],all)).toBe(NEVER);
  expect(basketProblem([get('bel-clarifying'),get('bel-retinol')],all)).toBe('Clarifying Serum et Retinol Complex Serum ne s’utilisent jamais dans la même routine : gardez l’un ou l’autre.');
  const duo={...get('bel-ritual'),id:'bel-duo',components:['bel-retinol','bel-clarifying']};
  expect(basketProblem([duo],[...all,duo])).toBe(NEVER);
  const oneSided=all.map(p=>p.id==='bel-clarifying'?{...p,excludes:undefined}:p);
  expect(basketProblem([get('bel-retinol'),oneSided.find(p=>p.id==='bel-clarifying')!],oneSided)).toBe(NEVER);
  expect(basketProblem([get('antiacne'),get('wcgel')],all)).toBeNull();
 });
 it('a manual add is blocked, not a warning to confirm; suggestions never pair them',()=>{
  expect(manualAddCheck(get('bel-retinol'),[],get('bel-clarifying'),face,all)).toEqual({blocked:NEVER,warnings:[],verifyIds:[]});
  expect(manualAddCheck(get('bel-moist'),[get('bel-retinol')],get('bel-clarifying'),face,all).blocked).toBe(NEVER);
  expect(canCombine(get('bel-moist'),[get('bel-retinol')],get('bel-clarifying'),face,all)).toBe(false);
 });
});
