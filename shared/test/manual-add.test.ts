import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'vitest';
import * as c from '../src/index.js';
const catalogue:c.Product[]=JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue.json',import.meta.url),'utf8'));
const p=(id:string)=>{const x=catalogue.find(x=>x.id===id);if(!x)throw new Error('missing fixture '+id);return x;};
const face:c.Profile={...c.EMPTY_PROFILE,concerns:['acne'],severity:'mild',skin:'mixed',sensitive:'no',routineKnown:true,routine:[],safety:['none']};
const hair:c.Profile={...face,concerns:['growth'],severity:''};
const check=(base:c.Product|string,added:string[],candidate:c.Product|string,profile:c.Profile=face)=>c.manualAddCheck(typeof base==='string'?p(base):base,added.map(p),typeof candidate==='string'?p(candidate):candidate,profile,catalogue);
const blocked=(message:string)=>({blocked:message,warnings:[],verifyIds:[]});
const ok=(...warnings:string[])=>({blocked:null,warnings,verifyIds:[]});

const DOMAIN='Autre zone que la commande initiale : besoin non évalué par le questionnaire.';
const COVERED='Étape déjà couverte (routine actuelle ou panier).';
const PRUDENT='Profil prudent : formule non signalée comme douce.';
const ACTIVE='Un soin ciblé actif est déjà présent : éviter de superposer les actifs.';
const SKIN='Non indiqué pour le type de peau renseigné.';
const VERIFY='Vérification spécifique requise : ';
const ALLERGY='Allergie déclarée : ingrédient à risque ou liste INCI non publiée.';
const SCALP='Routine spécifique : à valider d’abord par le référent de l’équipe.';

// Blocking rules: a verification by the adviser never overrides them.
test('A disabled reference is blocked',()=>assert.deepEqual(check('antiacne',[],{...p('wccream'),enabled:false}),blocked('Référence désactivée.')));
test('The order itself cannot be added again',()=>assert.deepEqual(check('antiacne',[],'antiacne'),blocked('Déjà dans la routine.')));
test('A product already added cannot be added again',()=>assert.deepEqual(check('antiacne',['wccream'],'wccream'),blocked('Déjà dans la routine.')));
test('The active pack counts as the base',()=>assert.deepEqual(check('packpousse',[],'packpousse',hair),blocked('Déjà dans la routine.')));
test('A fourth compatible physical product can be added',()=>assert.deepEqual(check('antiacne',['wcgel','wcspf'],'total'),ok()));
test('A fourth product after a pack retains the other-zone warning',()=>assert.deepEqual(check('packanti',['conditioner'],'wccream',hair),ok(DOMAIN)));
test('A requested pack can bring the basket above three products',()=>assert.deepEqual(check('antiacne',['wccream'],'packpousse'),ok(DOMAIN)));
test('A product already inside the pack ordered is blocked',()=>assert.deepEqual(check('packpousse',[],'conditioner',hair),blocked('Un produit est déjà inclus dans le pack ou la routine.')));
test('A pack containing the product ordered is blocked as an add-on',()=>assert.deepEqual(check('shpousse',[],'packpousse',hair),blocked('Un produit est déjà inclus dans le pack ou la routine.')));
test('Junior pack ordered: no add-on until its content is confirmed',()=>assert.deepEqual(check('packjunior',[],'conditioner',hair),blocked('Le contenu exact de ce pack doit être confirmé avant tout ajout.')));
test('Junior pack cannot be requested as an add-on either',()=>assert.deepEqual(check('conditioner',[],'packjunior',hair),blocked('Le contenu exact de ce pack doit être confirmé avant tout ajout.')));
test('Declared fragrance allergy blocks a fragranced product',()=>assert.deepEqual(check('antiacne',[],'wcspf',{...face,safety:['allergy'],allergens:['fragrance']}),blocked(ALLERGY)));
test('Declared allergy blocks a product whose INCI list is not published',()=>assert.deepEqual(check('wccream',[],'nia12',{...face,safety:['allergy'],allergens:['mi']}),blocked(ALLERGY)));
test('Declared allergy checks every product inside a requested pack',()=>{
 // The pack itself has a clean INCI here, so only its contents (shanti and serumhair contain essential oils) can trigger the block.
 const x={...p('packanti'),inciText:'aqua',fragrance:false,essentialOils:false},list=catalogue.map(y=>y.id===x.id?x:y);
 assert.deepEqual(c.manualAddCheck(p('conditioner'),[],x,{...hair,safety:['allergy'],allergens:['essential']},list),blocked(ALLERGY));
});
test('Declared fragrance allergy keeps a fragrance-free product',()=>assert.deepEqual(check('antiacne',[],'wccream',{...face,safety:['allergy'],allergens:['fragrance']}),ok()));
for(const id of ['shpso','serumpso','packpso'])test(id+' without the referent’s validation is blocked',()=>assert.deepEqual(check('conditioner',[],id,{...hair,concerns:['flakes']}),blocked(SCALP)));

test('A requested pack whose content includes a disabled reference is blocked',()=>{
 const list=catalogue.map(y=>y.id==='nia10'?{...y,enabled:false}:y),pack=list.find(y=>y.id==='bodypack')!;
 assert.equal(pack.enabled,true);
 for(const base of ['antiacne','wcgel','wccream'])assert.deepEqual(c.manualAddCheck(p(base),[],pack,face,list),blocked('Référence désactivée.'),base);
});

// First matching rule wins.
test('Disabled wins over already in the routine',()=>assert.deepEqual(check('antiacne',[],{...p('antiacne'),enabled:false}),blocked('Référence désactivée.')));
test('Duplicate wins over allergy',()=>assert.deepEqual(check('packpousse',[],'conditioner',{...hair,safety:['allergy'],allergens:['fragrance']}),blocked('Un produit est déjà inclus dans le pack ou la routine.')));
test('Allergy wins over the scalp protocol',()=>assert.deepEqual(check('conditioner',[],'shpso',{...hair,concerns:['flakes'],safety:['allergy'],allergens:['essential']}),blocked(ALLERGY)));

// Warnings: the adviser may still add, after an explicit confirmation.
test('A fitting product raises no warning',()=>assert.deepEqual(check('antiacne',[],'wccream'),ok()));
test('A hair product on a face order: other zone',()=>assert.deepEqual(check('antiacne',[],'shpousse'),ok(DOMAIN)));
test('A face product on a hair order: other zone',()=>assert.deepEqual(check('shpousse',[],'total',hair),ok(DOMAIN)));
test('Moisturiser when she already uses one: step covered',()=>assert.deepEqual(check('antiacne',[],'wccream',{...face,routine:['Hydratant']}),ok(COVERED)));
test('Second moisturiser in the basket: step covered',()=>assert.deepEqual(check('antiacne',['wcgel'],'wccream'),ok(COVERED)));
test('Shampoo inside a requested pack already covered by the order',()=>assert.deepEqual(check('shpousse',[],'packanti',hair),ok(COVERED)));
test('Sensitive profile and a formula not flagged gentle: prudent',()=>assert.deepEqual(check('antiacne',[],'wcspf',{...face,sensitive:'yes'}),ok(PRUDENT)));
test('Pregnancy and a cleanser flagged gentle: no warning',()=>assert.deepEqual(check('antiacne',[],'total',{...face,safety:['pregnancy']}),ok()));
test('Pregnancy and a non-gentle sunscreen: prudent',()=>assert.deepEqual(check('antiacne',[],'spray',{...face,safety:['pregnancy']}),ok(PRUDENT)));
test('Anti-acne serum plus another active: active stacking',()=>assert.deepEqual(check('antiacne',[],'gelclean'),ok(ACTIVE)));
test('An active when she already uses a targeted serum: active stacking',()=>assert.deepEqual(check('wccream',[],'gelclean',{...face,routine:['Soin ciblé']}),ok(ACTIVE)));
test('Two targeted serums: covered then active, in that order',()=>assert.deepEqual(check('antiacne',[],'nia10'),ok(COVERED,ACTIVE)));
test('Moisturiser not meant for the skin type',()=>assert.deepEqual(check('antiacne',[],'wcgel',{...face,skin:'dry'}),ok(SKIN)));
test('Active not meant for the skin type',()=>assert.deepEqual(check('wccream',[],'sal2',{...face,skin:'dry'}),ok(SKIN)));
test('Skin type unknown or not given: no skin warning',()=>{for(const skin of ['unknown',''])assert.deepEqual(check('antiacne',[],'wcgel',{...face,skin}),ok())});
test('Cleanser and sunscreen are not filtered by skin type',()=>assert.deepEqual(check('antiacne',[],'wcspf',{...face,skin:'dry'}),ok()));
test('Non-recommendable reference: verification warning with its own text, id to verify',()=>{
 assert.deepEqual(check('wccream',[],'nia12'),{blocked:null,warnings:[VERIFY+p('nia12').verificationRequired],verifyIds:['nia12']});
});
test('Reference flagged for verification even if recommendable',()=>{
 const x={...p('wccream'),id:'flagged',verificationRequired:'Vérifier le lot.'};
 assert.deepEqual(c.manualAddCheck(p('antiacne'),[],x,face,[...catalogue,x]),{blocked:null,warnings:[VERIFY+'Vérifier le lot.'],verifyIds:['flagged']});
});
test('Non-recommendable without a note: generic verification text',()=>assert.deepEqual(check('antiacne',[],{...p('wccream'),recommendable:false}),{blocked:null,warnings:[VERIFY+'fiche à vérifier avant ajout.'],verifyIds:['wccream']}));
test('Scalp routine validated by the referent: pack and its products to verify',()=>{
 const r=check('conditioner',[],'packpso',{...hair,concerns:['flakes'],scalpProtocol:true});
 assert.equal(r.blocked,null);
 assert.deepEqual(r.warnings,[VERIFY+p('packpso').verificationRequired]);
 assert.deepEqual([...r.verifyIds].sort(),['packpso','serumpso','shpso']);
});
test('All warnings together, in the documented order',()=>{
 const profile={...face,concerns:['dry'],severity:'',skin:'dry',sensitive:'yes',routine:['Soin ciblé']};
 assert.deepEqual(check('shpousse',[],'nia12',{...profile}),{blocked:null,warnings:[DOMAIN,COVERED,PRUDENT,ACTIVE,SKIN,VERIFY+p('nia12').verificationRequired],verifyIds:['nia12']});
});

// Invariant: anything the engine itself would combine is never blocked here, and only a pending verification can be flagged.
const profiles:[string,c.Profile][]=[
 ['face',face],
 ['sensitive',{...face,sensitive:'yes'}],
 ['dry skin with a cream',{...face,concerns:['dry'],severity:'',skin:'dry',routine:['Hydratant']}],
 ['unknown skin',{...face,skin:'unknown'}],
 ['fragrance allergy',{...face,safety:['allergy'],allergens:['fragrance']}],
 ['pregnancy',{...face,safety:['pregnancy']}],
 ['hair',hair],
 ['flakes with protocol',{...hair,concerns:['flakes'],scalpProtocol:true}],
 ['body',{...face,concerns:['bodyspots'],severity:''}],
];
for(const [name,profile] of profiles)test('Invariant over all catalogue pairs: '+name,()=>{
 const verified={...profile,verifiedProducts:catalogue.map(x=>x.id)};let combinable=0;
 for(const base of catalogue){
  const singles=catalogue.filter(x=>c.canCombine(base,[],x,verified,catalogue)).slice(0,3);
  for(const added of [[],...singles.map(x=>[x])])for(const candidate of catalogue){
   if(!c.canCombine(base,added,candidate,verified,catalogue))continue;combinable++;
   const r=c.manualAddCheck(base,added,candidate,verified,catalogue),where=base.id+' + '+added.map(x=>x.id).join(',')+' + '+candidate.id;
   assert.equal(r.blocked,null,where);
   assert.ok(r.warnings.every(w=>w.startsWith(VERIFY)),where+': '+r.warnings.join(' | '));
  }
 }
 assert.ok(combinable>0,'at least one combinable pair');
});
