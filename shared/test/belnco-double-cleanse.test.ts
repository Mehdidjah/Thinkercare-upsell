import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {EMPTY_PROFILE,canCombine,manualAddCheck,recommend,type Product,type Profile} from '../src/index.js';
const load=(f:string)=>JSON.parse(readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8')) as Product[];
// The BEL.NCO catalogue between 0008 and 0010: no pack, no prickly pear oil, the seven others on. Since 0010 the pack is back
// (belnco-pack-cleansing.test.ts); the oil and the gel chosen separately still go together, as here.
const touche=load('catalogue.json'),bel=load('belnco.json').filter(p=>!['bel-ritual','bel-pear'].includes(p.id)),all=[...touche,...bel];
const get=(id:string)=>all.find(p=>p.id===id)!;
const profile:Profile={...EMPTY_PROFILE,concerns:['dehydration'],skin:'mixed',sensitive:'no',routineKnown:true,routine:[],safety:['none'],makeup:'daily'};
const DOUBLE='Double nettoyage : l’huile démaquille d’abord, sur peau sèche, puis le gel nettoie, sur peau mouillée.';

describe('BEL.NCO double cleansing without the ritual: the oil and the gel, chosen separately', () => {
  it('the oil joins the gel, and the gel joins the oil', () => {
    expect(canCombine(get('bel-gel'),[],get('bel-oil'),profile,all)).toBe(true);
    expect(canCombine(get('bel-oil'),[],get('bel-gel'),profile,all)).toBe(true);
    const r=recommend(all,get('bel-gel'),profile);
    expect(r.map(c=>c.product.id)).toContain('bel-oil');
    expect(recommend(all,get('bel-oil'),{...profile,makeup:'none'}).find(c=>c.product.id==='bel-gel')?.reason).toBe(`Une étape lavante adaptée manque. ${DOUBLE}`);
  });
  it('a manual add of the other cleanser is not « Étape déjà couverte »', () => {
    expect(manualAddCheck(get('bel-gel'),[],get('bel-oil'),profile,all).warnings).not.toContain('Étape déjà couverte (routine actuelle ou panier).');
  });
  it('Touché keeps one cleanser per routine', () => {
    const t=touche.filter(p=>p.category==='Nettoyant'&&p.enabled);
    expect(t.length).toBeGreaterThan(1);
    expect(canCombine(t[0],[],t[1],{...profile,makeup:''},touche)).toBe(false);
    expect(manualAddCheck(t[0],[],t[1],{...profile,makeup:''},touche).warnings).toContain('Étape déjà couverte (routine actuelle ou panier).');
  });
});
