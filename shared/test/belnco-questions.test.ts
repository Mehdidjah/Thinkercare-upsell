import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BEL_CONCERNS,BEL_TARGETED,EMPTY_PROFILE,concernLabel,FACE_CONCERNS,concernsFor,manualAddCheck,missingAnswers,questionsReady,recommend,type Candidate,type Product,type Profile} from '../src/index.js';
const load=(f:string)=>JSON.parse(readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8')) as Product[];
const touche=load('catalogue.json'),bel=load('belnco.json'),all=[...touche,...bel];
const get=(id:string)=>all.find(p=>p.id===id)!;
const ids=(r:Candidate[])=>r.map(c=>c.product.id);
const targeted=(r:Candidate[])=>r.filter(c=>c.product.category==='Soin ciblé').map(c=>c.product.id);
const labels=(q:Profile,base?:Product)=>missingAnswers(q,base).map(m=>m.question+' '+m.label);
// Every BEL.NCO question answered, makeup included: no bonus for the cleansing oil.
const answered:Profile={...EMPTY_PROFILE,skin:'mixed',sensitive:'no',routineKnown:true,routine:[],safety:['none'],makeup:'none'};
const IRRITATED='Sa peau a déjà réagi au rétinol : à éviter ou avec grande prudence.';
const BEL_ORDER=['01 la priorité de la cliente','01 le type de boutons','01 le type de marque','01 le type de rougeurs','01 l’usage du rétinol','02 le type de peau','02 la sensibilité habituelle','03 le maquillage et la protection solaire','04 les soins déjà utilisés','05 les précautions utiles','05 l’allergène concerné','05 l’âge d’utilisation'];

describe('BEL.NCO questionnaire',()=>{
 it('a BEL.NCO call offers its own priorities, with the engine’s concern ids; Touché keeps its list',()=>{
  expect(concernsFor(get('bel-moist'))).toEqual([
   ['acne','Boutons et imperfections','Peau à tendance acnéique, imperfections'],
   ['blackheads','Pores et points noirs','Pores visibles, points noirs'],
   ['oil','Brillance','Excès de sébum, zone T'],
   ['aging','Rides et fermeté','Ridules, perte de fermeté'],
   ['marks','Taches et marques','Taches, marques après les boutons'],
   ['red','Rougeurs et sensibilité','Peau réactive, rougeurs légères'],
   ['dehydration','Peau sèche ou déshydratée','Tiraillements, manque de confort'],
   ['dull','Teint terne','Manque d’éclat, teint fatigué'],
  ]);
  for(const p of bel)expect(concernsFor(p),p.id).toBe(BEL_CONCERNS);
  // Same ids as the engine, each one claimed by a sellable BEL.NCO product; dry and scars are not offered.
  for(const [id] of BEL_CONCERNS){
   expect(FACE_CONCERNS.map(c=>c[0])).toContain(id);
   expect(bel.some(p=>p.enabled&&p.recommendable&&p.concerns.includes(id)),id).toBe(true);
  }
  expect(BEL_CONCERNS.map(c=>c[0])).not.toContain('dry');
  expect(BEL_CONCERNS.map(c=>c[0])).not.toContain('scars');
  expect(concernsFor(get('antiacne'))).toBe(FACE_CONCERNS);
  expect(concernsFor(undefined)).toBe(FACE_CONCERNS);
 });

 it('BEL.NCO asks makeup (03) and, with « Rides et fermeté », the retinol; routine and safety become 04 and 05',()=>{
  const moist=get('bel-moist'),ready={...answered,concerns:['dehydration']};
  expect(labels(EMPTY_PROFILE,moist)).toEqual(['01 la priorité de la cliente','02 le type de peau','02 la sensibilité habituelle','03 le maquillage et la protection solaire','04 les soins déjà utilisés','05 les précautions utiles']);
  expect(questionsReady(ready,moist)).toBe(true);
  expect(missingAnswers(ready,moist)).toEqual([]);
  for(const makeup of ['',undefined]){
   expect(questionsReady({...ready,makeup},moist)).toBe(false);
   expect(missingAnswers({...ready,makeup},moist)).toEqual([{question:'03',label:'le maquillage et la protection solaire'}]);
  }
  expect(questionsReady({...ready,concerns:['aging']},moist)).toBe(false);
  expect(missingAnswers({...ready,concerns:['aging']},moist)).toEqual([{question:'01',label:'l’usage du rétinol'}]);
  for(const retinol of ['never','tolerated','irritated'])expect(questionsReady({...ready,concerns:['aging'],retinol},moist),retinol).toBe(true);
  expect(labels({...ready,routineKnown:false},moist)).toEqual(['04 les soins déjà utilisés']);
  expect(labels({...ready,safety:[]},moist)).toEqual(['05 les précautions utiles']);
  expect(labels({...ready,safety:['allergy','minor']},moist)).toEqual(['05 l’allergène concerné','05 l’âge d’utilisation']);
  expect(labels({...EMPTY_PROFILE,concerns:['aging','red','marks','acne'],safety:['minor','allergy']},moist)).toEqual(BEL_ORDER.filter(l=>l!=='01 la priorité de la cliente'&&l!=='05 les précautions utiles'));
 });

 it('the retinol answer is asked and required with every priority that can bring the retinol serum: « Rides et fermeté », « Taches et marques », « Teint terne »',()=>{
  const moist=get('bel-moist'),RETINOL={question:'01',label:'l’usage du rétinol'};
  const followed=(concerns:string[]):Profile=>({...answered,concerns,severity:'mild',marks:'flat',redState:'mild'});
  const asks=(id:string)=>missingAnswers(followed([id]),moist).some(m=>m.label===RETINOL.label);
  const asked=BEL_CONCERNS.map(c=>c[0]).filter(asks);
  expect(asked).toEqual(['aging','marks','dull']);
  // The question covers every way the retinol serum is suggested: the targeted care of a priority, or the serum’s own concerns.
  expect(BEL_CONCERNS.map(c=>c[0]).filter(c=>BEL_TARGETED[c]?.includes('bel-retinol'))).toEqual(asked);
  for(const c of get('bel-retinol').concerns)expect(asked,c).toContain(c);
  for(const [id] of BEL_CONCERNS)for(const concerns of [[id],['dehydration',id],[id,'dehydration']].filter(c=>new Set(c).size===c.length)){
   const asking=asked.includes(id);
   expect(questionsReady(followed(concerns),moist),concerns.join('+')).toBe(!asking);
   expect(missingAnswers(followed(concerns),moist),concerns.join('+')).toEqual(asking?[RETINOL]:[]);
   expect(questionsReady({...followed(concerns),retinol:'never'},moist),concerns.join('+')).toBe(true);
  }
 });

 it('« Ma peau a réagi » keeps the retinol serum out whichever priority asked it, and a manual add warns',()=>{
  const moist=get('bel-moist'),daily:Profile={...answered,makeup:'daily'};
  for(const patch of [{concerns:['aging']},{concerns:['marks'],marks:'flat'},{concerns:['dull']},{concerns:['dehydration','dull']}] as Partial<Profile>[]){
   const label=patch.concerns!.join('+');
   // Not vacuous: with a first use the serum is offered for this priority, or at least the call reaches its suggestions.
   expect(recommend(all,moist,{...daily,...patch,retinol:'never'}).length,label).toBeGreaterThan(0);
   if(patch.concerns![0]!=='dehydration')expect(ids(recommend(all,moist,{...daily,...patch,retinol:'never'})),label).toContain('bel-retinol');
   const irritated={...daily,...patch,retinol:'irritated'};
   expect(recommend(all,moist,irritated).length,label).toBeGreaterThan(0);
   expect(ids(recommend(all,moist,irritated)),label).not.toContain('bel-retinol');
   expect(manualAddCheck(moist,[],get('bel-retinol'),irritated,all).warnings,label).toContain(IRRITATED);
   // Without the answer the call doesn't reach its suggestions: the retinol serum is never offered unasked.
   expect(recommend(all,moist,{...daily,...patch,retinol:''}),label).toEqual([]);
  }
 });

 it('invariant over a generated grid: questionsReady ⇔ nothing missing, in screen order (BEL.NCO base)',()=>{
  const subsets=<T,>(xs:T[]):T[][]=>xs.reduce<T[][]>((acc,x)=>acc.concat(acc.map(s=>[...s,x])),[[]]);
  let count=0,readyCount=0;
  for(const concerns of subsets(['acne','aging','red','dull']))for(const order of [concerns,[...concerns].reverse()])
  for(const skin of ['','mixed'])for(const sensitive of ['','no'])for(const routineKnown of [true,false])
  for(const safety of [[],['none'],['allergy','minor']])for(const severity of ['','mild'])for(const redState of ['','mild'])
  for(const makeup of [undefined,'','spf'])for(const retinol of [undefined,'','never'])for(const allergens of [[],['fragrance']])for(const age of ['','teen']){
   const q:Profile={...EMPTY_PROFILE,concerns:order,skin,sensitive,routineKnown,routine:[],safety,severity,redState,makeup,retinol,allergens,age};
   const missing=labels(q,get('bel-moist')),isReady=questionsReady(q,get('bel-moist'));
   count++;if(isReady)readyCount++;
   if(isReady!==(missing.length===0))expect.fail('questionsReady='+isReady+' but missing='+JSON.stringify(missing)+' for '+JSON.stringify(q));
   const idx=missing.map(m=>BEL_ORDER.indexOf(m));
   if(!idx.every((v,i)=>v>=0&&(i===0||v>idx[i-1])))expect.fail('unknown or out of order '+JSON.stringify(missing));
  }
  expect(count).toBeGreaterThan(50000);
  expect(readyCount>0&&readyCount<count).toBe(true);
 });

 it('a Touché call never asks, requires or scores the makeup and retinol answers',()=>{
  const face=get('antiacne');
  expect(labels(EMPTY_PROFILE,face)).toEqual(['01 la priorité de la cliente','02 le type de peau','02 la sensibilité habituelle','03 les soins déjà utilisés','04 les précautions utiles']);
  const aging={...answered,makeup:'',concerns:['aging']};
  for(const base of [face,get('wccream'),get('shpousse')]){
   expect(questionsReady(aging,base),base.id).toBe(true);
   expect(missingAnswers(aging,base),base.id).toEqual([]);
  }
  const profiles:Profile[]=[{...aging,concerns:['acne'],severity:'mild'},{...aging,concerns:['dull']},aging,{...aging,concerns:['dehydration']},{...aging,concerns:['growth','breakage']}];
  for(const base of touche.filter(p=>p.enabled))for(const p of profiles){
   const plain=recommend(all,base,p),answers=recommend(all,base,{...p,makeup:'daily',retinol:'irritated'});
   expect(answers,base.id+' '+p.concerns).toEqual(plain);
   for(const c of touche)expect(manualAddCheck(base,[],c,{...p,makeup:'daily',retinol:'irritated'},all)).toEqual(manualAddCheck(base,[],c,p,all));
  }
 });
});

describe('BEL.NCO suggestions from the answers',()=>{
 it('« Maquillage tous les jours »: the oil and the ritual gain 40 on the cleanser step and say why; « Crème solaire seulement »: the oil gains 20',()=>{
  const at=(makeup:string)=>new Map(recommend(all,get('bel-moist'),{...answered,concerns:['dull'],retinol:'tolerated',makeup}).map(c=>[c.product.id,c]));
  const none=at('none'),daily=at('daily'),spf=at('spf');
  const gain=(m:Map<string,Candidate>,id:string)=>m.get(id)!.score-none.get(id)!.score;
  expect([gain(daily,'bel-oil'),gain(daily,'bel-ritual'),gain(daily,'bel-gel')]).toEqual([40,40,0]);
  expect([gain(spf,'bel-oil'),gain(spf,'bel-ritual'),gain(spf,'bel-gel')]).toEqual([20,0,0]);
  const double='Elle se maquille tous les jours : le double nettoyage (huile puis gel) retire maquillage et SPF sans dessécher.';
  expect(daily.get('bel-oil')!.reason).toBe(double);
  expect(daily.get('bel-ritual')!.reason).toBe(double);
  expect(spf.get('bel-oil')!.reason).toBe('Elle met une crème solaire tous les jours : l’huile démaquillante la retire en douceur, sans dessécher.');
  expect(none.get('bel-oil')!.reason).toBe('Une étape lavante adaptée manque. Le double nettoyage passe par le rituel (huile puis gel), jamais par deux nettoyants séparés.');
  expect(none.get('bel-ritual')!.reason).toBe(spf.get('bel-ritual')!.reason);
  expect(none.get('bel-ritual')!.reason).toBe(get('bel-ritual').pitch+' Son contenu est compté dans la routine pour éviter tout doublon.');
  // Every other suggestion keeps its score: the bonus is for the cleansers only.
  for(const [id,c] of daily)if(id!=='bel-oil'&&id!=='bel-ritual')expect(c.score,id).toBe(none.get(id)!.score);
 });

 it('the priority puts its targeted care first, whatever the product ordered',()=>{
  const cases:[string,Partial<Profile>,string[]][]=[
   ['aging, never',{concerns:['aging'],retinol:'never'},['bel-retinol','bel-pear']],
   ['aging, tolerated',{concerns:['aging'],retinol:'tolerated'},['bel-retinol','bel-pear']],
   ['aging, irritated',{concerns:['aging'],retinol:'irritated'},['bel-pear']],
   ['marks',{concerns:['marks'],marks:'flat',retinol:'tolerated'},['bel-clarifying','bel-retinol']],
   ['red',{concerns:['red'],redState:'mild'},['bel-spf30']],
   ['dull',{concerns:['dull'],retinol:'tolerated'},['bel-pear','bel-retinol']],
   ['dehydration',{concerns:['dehydration']},['bel-pear']],
  ];
  for(const base of ['bel-oil','bel-gel','bel-moist','bel-uv50','bel-ritual'])for(const [label,patch,first] of cases){
   const r=targeted(recommend(all,get(base),{...answered,...patch}));
   expect(r.slice(0,first.length),base+' · '+label).toEqual(first);
  }
  // Acne, pores and shine: the clarifying serum only, as before.
  for(const base of ['bel-oil','bel-gel','bel-moist','bel-uv50','bel-ritual'])for(const patch of [{concerns:['acne'],severity:'mild'},{concerns:['acne'],severity:'blackheads'},{concerns:['blackheads']},{concerns:['oil']}])
   expect(targeted(recommend(all,get(base),{...answered,...patch})),base+' · '+patch.concerns[0]).toEqual(['bel-clarifying']);
 });

 it('retinol: an irritated skin never gets it suggested and a manual add warns; a first use starts slowly',()=>{
  const aging={...answered,concerns:['aging']};
  for(const base of ['bel-oil','bel-gel','bel-moist','bel-uv50','bel-ritual']){
   expect(ids(recommend(all,get(base),{...aging,retinol:'irritated'})),base).not.toContain('bel-retinol');
   const m=manualAddCheck(get(base),[],get('bel-retinol'),{...aging,retinol:'irritated'},all);
   expect(m.blocked,base).toBeNull();
   expect(m.warnings,base).toContain(IRRITATED);
   for(const retinol of ['never','tolerated'])expect(manualAddCheck(get(base),[],get('bel-retinol'),{...aging,retinol},all).warnings,base).not.toContain(IRRITATED);
   expect(manualAddCheck(get(base),[],get('bel-pear'),{...aging,retinol:'irritated'},all).warnings,base).not.toContain(IRRITATED);
  }
  const reason=(retinol:string)=>recommend(all,get('bel-moist'),{...aging,retinol}).find(c=>c.product.id==='bel-retinol')!.reason;
  expect(reason('never')).toBe('Répond à la priorité « rides et fermeté ». Un seul soin ciblé, avec les ingrédients de la fiche et une tolérance à vérifier. Commencer 2 à 3 soirs par semaine.');
  expect(reason('tolerated')).toBe('Répond à la priorité « rides et fermeté ». Un seul soin ciblé, avec les ingrédients de la fiche et une tolérance à vérifier.');
  // The line names the BEL.NCO answer the customer gave.
  expect(recommend(all,get('bel-moist'),{...answered,concerns:['acne'],severity:'mild'}).find(c=>c.product.id==='bel-clarifying')!.reason).toBe('Répond à la priorité « boutons et imperfections ». Un seul soin ciblé, avec les ingrédients de la fiche et une tolérance à vérifier.');
  expect(recommend(all,get('bel-gel'),{...answered,concerns:['marks'],marks:'flat',retinol:'tolerated'}).find(c=>c.product.id==='bel-clarifying')!.reason).toBe('Répond à la priorité « taches et marques ». Un seul soin ciblé, avec les ingrédients de la fiche et une tolérance à vérifier.');
 });

 it('a declared allergy covers the BEL.NCO rows: no BEL.NCO row publishes its INCI list, so every one stays out',()=>{
  // The flags the allergens map to: fragrance on the oil, gel, retinol and ritual; essential oils on the clarifying serum only.
  expect(bel.filter(p=>p.fragrance).map(p=>p.id)).toEqual(['bel-oil','bel-gel','bel-retinol','bel-ritual']);
  expect(bel.filter(p=>p.essentialOils).map(p=>p.id)).toEqual(['bel-clarifying']);
  expect(bel.every(p=>!p.inciText)).toBe(true);
  const allergy=(allergens:string[]):Profile=>({...answered,concerns:['dull'],retinol:'tolerated',safety:['allergy'],allergens});
  for(const allergens of [['fragrance'],['essential'],['mi'],['nuts'],['salicylates']]){
   for(const base of ['bel-oil','bel-gel','bel-moist','bel-uv50','bel-ritual'])expect(recommend(all,get(base),allergy(allergens)),base+' '+allergens).toEqual([]);
   for(const p of bel.filter(p=>p.enabled&&p.id!=='bel-moist'))expect(manualAddCheck(get('bel-moist'),[],p,allergy(allergens),all).blocked,p.id+' '+allergens).toBe('Allergie déclarée : ingrédient à risque ou liste INCI non publiée.');
  }
 });
});

describe('a priority is named in the call\'s brand', () => {
  it('BEL.NCO wording on a BEL.NCO call, Touché wording on a Touché call, any leftover priority still named', () => {
    expect(concernLabel('dehydration',get('bel-moist'))).toBe('Peau sèche ou déshydratée');
    expect(concernLabel('acne',get('bel-gel'))).toBe('Boutons et imperfections');
    expect(concernLabel('acne',get('antiacne'))).toBe(FACE_CONCERNS.find(c=>c[0]==='acne')![1]);
    // A Touché priority kept after « Marque » changed: named with its Touché label, never its id.
    expect(concernLabel('dry',get('bel-moist'))).toBe(FACE_CONCERNS.find(c=>c[0]==='dry')![1]);
    expect(concernLabel('inconnu',get('bel-moist'))).toBe('inconnu');
  });
});
