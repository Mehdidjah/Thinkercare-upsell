import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'vitest';
import * as c from '../src/index.js';
const catalogue:any[]=JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue.json',import.meta.url),'utf8'));
const p=(id:string)=>catalogue.find(x=>x.id===id);
const face=p('antiacne'),hair=p('shpousse');
const ready:c.Profile={...c.EMPTY_PROFILE,concerns:['dry'],skin:'mixed',sensitive:'no',routineKnown:true,routine:[],safety:['none']};
const labels=(q:c.Profile,base?:c.Product)=>c.missingAnswers(q,base).map(m=>m.question+' '+m.label);

test('Fixture bases are one face product and one hair product',()=>{assert.equal(c.domainOf(face),'face');assert.equal(c.domainOf(hair),'hair')});
test('A complete profile has nothing missing',()=>{for(const base of [face,hair,undefined])assert.deepEqual(c.missingAnswers(ready,base),[])});

const single:[string,Partial<c.Profile>,string,string,string][]=[
 ['no concern',{concerns:[]},'01','la priorité de la cliente','la priorité de la cliente'],
 ['acne without severity',{concerns:['acne'],severity:''},'01','le type de boutons','le type de boutons'],
 ['marks without marks',{concerns:['marks'],marks:''},'01','le type de marque','le type de marque'],
 ['red without redState',{concerns:['red'],redState:''},'01','le type de rougeurs','le type de rougeurs'],
 ['red with redState missing',{concerns:['red'],redState:undefined},'01','le type de rougeurs','le type de rougeurs'],
 ['fall without hairPattern',{concerns:['fall'],hairPattern:''},'01','le type de chute','le type de chute'],
 ['fall with hairPattern missing',{concerns:['fall'],hairPattern:undefined},'01','le type de chute','le type de chute'],
 ['no skin',{skin:''},'02','le type de peau','le profil capillaire'],
 ['no sensitivity',{sensitive:''},'02','la sensibilité habituelle','la sensibilité du cuir chevelu'],
 ['routine unknown',{routineKnown:false},'03','les soins déjà utilisés','les soins déjà utilisés'],
 ['no safety signal',{safety:[]},'04','les précautions utiles','les précautions utiles'],
 ['allergy without allergens',{safety:['allergy'],allergens:[]},'04','l’allergène concerné','l’allergène concerné'],
 ['allergy with allergens missing',{safety:['allergy'],allergens:undefined},'04','l’allergène concerné','l’allergène concerné'],
 ['minor without age',{safety:['minor'],age:''},'04','l’âge d’utilisation','l’âge d’utilisation'],
 ['minor with age missing',{safety:['minor'],age:undefined},'04','l’âge d’utilisation','l’âge d’utilisation'],
];
for(const [name,patch,question,faceLabel,hairLabel] of single){
 test('Missing '+name+' (face base)',()=>assert.deepEqual(c.missingAnswers({...ready,...patch},face),[{question,label:faceLabel}]));
 test('Missing '+name+' (hair base)',()=>assert.deepEqual(c.missingAnswers({...ready,...patch},hair),[{question,label:hairLabel}]));
}
test('Without a base, labels default to the face wording',()=>assert.deepEqual(labels({...ready,skin:'',sensitive:''}),['02 le type de peau','02 la sensibilité habituelle']));
test('Answered follow-ups are not reported',()=>{
 const q:c.Profile={...ready,concerns:['acne','marks','red','fall'],severity:'mild',marks:'flat',redState:'mild',hairPattern:'gradual',safety:['allergy','minor'],allergens:['fragrance'],age:'teen'};
 for(const base of [face,hair])assert.deepEqual(c.missingAnswers(q,base),[]);
});
test('Empty profile lists the four main questions in screen order',()=>{
 assert.deepEqual(labels(c.EMPTY_PROFILE,face),['01 la priorité de la cliente','02 le type de peau','02 la sensibilité habituelle','03 les soins déjà utilisés','04 les précautions utiles']);
 assert.deepEqual(labels(c.EMPTY_PROFILE,hair),['01 la priorité de la cliente','02 le profil capillaire','02 la sensibilité du cuir chevelu','03 les soins déjà utilisés','04 les précautions utiles']);
});
test('Every missing answer is listed in screen order, whatever the selection order',()=>{
 const q:c.Profile={...c.EMPTY_PROFILE,concerns:['fall','red','dry','marks','acne'],safety:['minor','allergy']};
 const expected=(skin:string,sensitive:string)=>['01 le type de boutons','01 le type de marque','01 le type de rougeurs','01 le type de chute',skin,sensitive,'03 les soins déjà utilisés','04 l’allergène concerné','04 l’âge d’utilisation'];
 assert.deepEqual(labels(q,face),expected('02 le type de peau','02 la sensibilité habituelle'));
 assert.deepEqual(labels(q,hair),expected('02 le profil capillaire','02 la sensibilité du cuir chevelu'));
});

function subsets<T>(xs:T[]):T[][]{return xs.reduce<T[][]>((acc,x)=>acc.concat(acc.map(s=>[...s,x])),[[]]);}
function* grid():Generator<c.Profile>{
 for(const concerns of subsets(['acne','marks','red','fall','dry']))
 for(const order of [concerns,[...concerns].reverse()])
 for(const skin of ['','mixed'])for(const sensitive of ['','no'])for(const routineKnown of [true,false])
 for(const safety of [[],['none'],['allergy'],['minor'],['allergy','minor']])
 for(const severity of ['','mild'])for(const marks of ['','flat'])
 for(const redState of [undefined,'','mild'])for(const hairPattern of [undefined,'','gradual'])
 for(const allergens of [undefined,[],['fragrance']])for(const age of [undefined,'','teen'])
  yield {...c.EMPTY_PROFILE,concerns:order,skin,sensitive,routineKnown,routine:[],safety,severity,marks,redState,hairPattern,allergens,age};
}
const canonical=(base:c.Product)=>['01 la priorité de la cliente','01 le type de boutons','01 le type de marque','01 le type de rougeurs','01 le type de chute',...(c.domainOf(base)==='hair'?['02 le profil capillaire','02 la sensibilité du cuir chevelu']:['02 le type de peau','02 la sensibilité habituelle']),'03 les soins déjà utilisés','04 les précautions utiles','04 l’allergène concerné','04 l’âge d’utilisation'];
for(const [name,base] of [['face base antiacne',face],['hair base shpousse',hair]] as const){
 test('Invariant over a generated grid: questionsReady ⇔ nothing missing ('+name+')',()=>{
  const order=canonical(base);let count=0,readyCount=0;
  for(const q of grid()){
   count++;
   const missing=labels(q,base),isReady=c.questionsReady(q,base);
   if(isReady)readyCount++;
   if(isReady!==(missing.length===0))assert.fail('questionsReady='+isReady+' but missing='+JSON.stringify(missing)+' for '+JSON.stringify(q));
   const idx=missing.map(m=>order.indexOf(m));
   if(!idx.every(i=>i>=0))assert.fail('unknown label '+JSON.stringify(missing));
   if(!idx.every((v,i)=>i===0||v>idx[i-1]))assert.fail('out of order '+JSON.stringify(missing));
  }
  assert.ok(count>100000,'grid size '+count);
  assert.ok(readyCount>0&&readyCount<count,'grid covers both ready and incomplete profiles');
 });
}
