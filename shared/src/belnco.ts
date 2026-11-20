import type {Product} from './core.js';
/** BEL.NCO pairings (docs/belnco/synthese.md §4): for each product bought, its complements, best first. */
export const BEL_PATHS:Record<string,string[]>={
 'bel-oil':['bel-gel','bel-moist','bel-uv50'],
 'bel-gel':['bel-clarifying','bel-spf30','bel-oil'],
 'bel-spf30':['bel-clarifying','bel-retinol','bel-gel'],
 'bel-clarifying':['bel-moist','bel-uv50','bel-gel'],
 'bel-retinol':['bel-moist','bel-uv50','bel-pear'],
 'bel-moist':['bel-uv50','bel-retinol','bel-clarifying','bel-gel'],
 'bel-uv50':['bel-moist','bel-gel','bel-oil'],
 'bel-pear':['bel-moist','bel-uv50','bel-gel'],
 'bel-tinted':[],
 'bel-ritual':['bel-moist','bel-uv50','bel-clarifying'],
};
/** The score a suggestion gains for its rank in the base product's pairings. */
export const PAIRING_BONUS=[30,20,10,5];
/** The bonus for the best-ranked of the product or its components among the base's pairings; 0 when none is listed. */
export function pairingBonus(base:Product,p:Product):number{
 const path=BEL_PATHS[base.id]??[],ranks=[p.id,...(p.components??[])].map(id=>path.indexOf(id)).filter(i=>i>=0);
 return ranks.length?PAIRING_BONUS[Math.min(...ranks)]??0:0;
}
/** The priorities a BEL.NCO call offers: the engine's concern ids, labelled for the brand's products (no dry, no scars). */
export const BEL_CONCERNS=[['acne','Boutons et imperfections','Peau à tendance acnéique, imperfections'],['blackheads','Pores et points noirs','Pores visibles, points noirs'],['oil','Brillance','Excès de sébum, zone T'],['aging','Rides et fermeté','Ridules, perte de fermeté'],['marks','Taches et marques','Taches, marques après les boutons'],['red','Rougeurs et sensibilité','Peau réactive, rougeurs légères'],['dehydration','Peau sèche ou déshydratée','Tiraillements, manque de confort'],['dull','Teint terne','Manque d’éclat, teint fatigué']];
/** The targeted care (Soin ciblé) each BEL.NCO priority puts first, best first. */
export const BEL_TARGETED:Record<string,string[]>={acne:['bel-clarifying'],blackheads:['bel-clarifying'],oil:['bel-clarifying'],aging:['bel-retinol','bel-pear'],marks:['bel-clarifying','bel-retinol'],red:['bel-spf30'],dull:['bel-pear','bel-retinol'],dehydration:['bel-pear']};
/** « Avez-vous déjà utilisé du rétinol ? » goes with every priority whose targeted care lists the retinol serum (rides, taches, teint terne), first or second.
 *  The answer is about the customer, so it holds while any of them stays chosen. */
export const asksRetinol=(concerns:string[])=>concerns.some(c=>BEL_TARGETED[c]?.includes('bel-retinol'));
/** The score the first and second targeted care gain: each step is larger than any pairing bonus, so the order holds whatever was ordered. */
export const TARGETED_BONUS=[70,35];
/** The cleanser bonus from the makeup answer: daily makeup asks for the double cleansing, a daily sunscreen for the oil. */
export function makeupBonus(p:Product,makeup?:string):number{
 if(makeup==='daily'&&(p.id==='bel-oil'||p.id==='bel-ritual'))return 40;
 return makeup==='spf'&&p.id==='bel-oil'?20:0;
}
/** BEL.NCO double cleansing: the Cleansing Oil (on dry skin) then the Cleansing Gel (on wet skin), chosen separately. */
export const DOUBLE_CLEANSE=['bel-oil','bel-gel'];
export const DOUBLE_CLEANSE_LINE='Double nettoyage : l’huile démaquille d’abord, sur peau sèche, puis le gel nettoie, sur peau mouillée.';
/** True when `p` is one of the two and the products already there hold the other: their shared step is no duplicate. */
export const doubleCleanse=(current:{id:string}[],p:{id:string}):boolean=>DOUBLE_CLEANSE.includes(p.id)&&current.some(x=>x.id!==p.id&&DOUBLE_CLEANSE.includes(x.id));
