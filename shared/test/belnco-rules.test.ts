import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {EMPTY_PROFILE,FACE_CONCERNS,cataloguePath,concernsFor,goalPhrase,manualAddCheck,packUpgrades,productTags,recommend,searchIds,type Candidate,type Product,type Profile} from '../src/index.js';
const load=(f:string)=>JSON.parse(readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8')) as Product[];
const touche=load('catalogue.json'),bel=load('belnco.json'),all=[...touche,...bel];
const get=(id:string)=>all.find(p=>p.id===id)!;
const ids=(r:Candidate[])=>r.map(c=>c.product.id);
// A BEL.NCO call also asks makeup (question 03) and, with « Rides et fermeté », « Taches et marques » or « Teint terne », the retinol: « Ni l’un ni l’autre » and « Oui, bien toléré » keep the scores as before.
const ready={...EMPTY_PROFILE,sensitive:'no',routineKnown:true,routine:[],safety:['none'],makeup:'none'};
const dehydrated:Profile={...ready,concerns:['dehydration'],skin:'normal'};
const acne:Profile={...ready,concerns:['acne'],severity:'mild',skin:'mixed'};
const dull:Profile={...ready,concerns:['dull'],retinol:'tolerated',skin:'normal'};

describe('BEL.NCO selling rules',()=>{
 it('adds « Rides et fermeté » for both brands; no Touché product claims it',()=>{
  const i=FACE_CONCERNS.findIndex(c=>c[0]==='aging');
  expect(FACE_CONCERNS[i]).toEqual(['aging','Rides et fermeté','Ridules, fermeté, éclat qui baisse']);
  expect(FACE_CONCERNS[i-1][0]).toBe('dull');
  expect(concernsFor(get('antiacne')).some(c=>c[0]==='aging')).toBe(true);
  expect(touche.some(p=>p.concerns.includes('aging'))).toBe(false);
  expect(goalPhrase({...dehydrated,concerns:['aging']})).toBe('prendre soin des ridules et de la fermeté de votre peau');
 });
 it('after an evening serum the brand’s SPF ranks first, with its reason',()=>{
  const r=recommend(all,get('bel-retinol'),dehydrated);
  expect(ids(r).slice(0,2)).toEqual(['bel-uv50','bel-moist']);
  expect(r[0].reason).toBe('Le soin du soir choisi rend la peau plus sensible au soleil : un SPF le lendemain matin est indispensable.');
  expect(ids(recommend(all,get('bel-clarifying'),acne)).slice(0,2)).toEqual(['bel-uv50','bel-moist']);
  expect(ids(recommend(all,get('bel-clarifying'),acne))).not.toContain('bel-retinol');
  expect(productTags(get('bel-retinol'))).toEqual(['Soir uniquement / SPF le lendemain matin']);
  expect(productTags(get('antiacne'))).toEqual([]);
 });
 it('a cautious profile still gets the SPF first after an evening serum; other non-gentle products stay out',()=>{
  const sun='Le soin du soir choisi rend la peau plus sensible au soleil : un SPF le lendemain matin est indispensable.';
  const cautious:[string,Profile][]=[['sensitive yes',{...dehydrated,sensitive:'yes'}],['sensitive unknown',{...dehydrated,sensitive:'unknown'}],['red',{...dehydrated,concerns:['dehydration','red'],redState:'mild'}],['treatment',{...dehydrated,safety:['treatment']}],['pregnancy',{...dehydrated,safety:['pregnancy']}],['teen',{...dehydrated,safety:['minor'],age:'teen'}],['scars',{...dehydrated,concerns:['dehydration','scars']}]];
  for(const [label,p] of cautious){
   const r=recommend(all,get('bel-retinol'),p);
   expect(ids(r)[0],label).toBe('bel-uv50');
   expect(r[0].reason,label).toBe(sun);
   expect(ids(r),label).not.toContain('bel-oil');
   const c=recommend(all,get('bel-clarifying'),{...p,concerns:['acne',...p.concerns.slice(1)],severity:'mild',skin:'oily'});
   expect(ids(c)[0],label).toBe('bel-uv50');
  }
  // Without an evening serum in the basket the cautious rule is unchanged: no non-gentle SPF.
  expect(ids(recommend(all,get('bel-moist'),{...dehydrated,sensitive:'yes'}))).not.toContain('bel-uv50');
 });
 it('pairings from synthese §4 lead the suggestions; the brand’s moisturizer answers an unknown skin',()=>{
  expect(ids(recommend(all,get('bel-gel'),acne))[0]).toBe('bel-clarifying');
  expect(ids(recommend(all,get('bel-uv50'),{...dehydrated,skin:'unknown'}))).toContain('bel-moist');
 });
 // 2026-11-21 (0008): the ritual left the live catalogue; double cleansing is the oil then the gel, chosen separately.
 // A ritual pack, when the catalogue has one, is still offered as the cleansers' upgrade.
 it('double cleansing: the ritual when there is one, and the oil with the gel',()=>{
  for(const id of ['bel-oil','bel-gel'])expect(ids(packUpgrades(all,get(id),dull))).toEqual(['bel-ritual']);
  expect(ids(recommend(all,get('bel-retinol'),dehydrated))).toContain('bel-ritual');
  expect(ids(recommend(all,get('bel-oil'),dull))).toContain('bel-gel');
  expect(recommend(all,get('bel-retinol'),dehydrated).find(c=>c.product.id==='bel-oil')!.reason).toBe('Une étape lavante adaptée manque.');
 });
 it('pregnancy or a minor keep the retinol and the acid serum out of suggestions; a manual add warns',()=>{
  for(const safety of [['pregnancy'],['minor']]){
   const p:Profile={...dehydrated,concerns:['aging'],retinol:'tolerated',safety,age:safety[0]==='minor'?'teen':''};
   expect(ids(recommend(all,get('bel-moist'),p))).not.toContain('bel-retinol');
   expect(ids(recommend(all,get('bel-moist'),p))).not.toContain('bel-clarifying');
   const m=manualAddCheck(get('bel-moist'),[],get('bel-retinol'),p,all);
   expect(m.blocked).toBeNull();
   expect(m.warnings).toContain('Profil prudent : formule non signalée comme douce.');
  }
 });
 it('product paths list same-brand complements and the evening rule; Touché paths are unchanged',()=>{
  const path=cataloguePath(get('bel-retinol'),all);
  expect(path.complements).toEqual(['bel-moist','bel-uv50','bel-pear']);
  expect(path.checks).toEqual(['Soir uniquement / SPF le lendemain matin.','Jamais avec Clarifying Serum dans la même routine.']);
  expect(cataloguePath(get('bel-oil'),all).complements).toEqual(['bel-gel','bel-moist','bel-uv50']);
  expect(cataloguePath(get('bel-tinted'),all).complements).toEqual([]);
  for(const p of touche)expect(cataloguePath(p,all)).toEqual(cataloguePath(p,touche));
 });
 it('search knows the BEL.NCO words and the brand name',()=>{
  expect(searchIds(all,'figue de barbarie')).toEqual(new Set(['bel-pear']));
  expect([...searchIds(all,'bel nco')].sort()).toEqual(bel.map(p=>p.id).sort());
  expect(searchIds(bel,'cica')).toEqual(new Set(['bel-oil','bel-gel','bel-spf30']));
  expect(searchIds(bel,'démaquillant').has('bel-oil')).toBe(true);
  expect(searchIds(bel,'moisturizer')).toEqual(new Set(['bel-moist']));
 });
});
