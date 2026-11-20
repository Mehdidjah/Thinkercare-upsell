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
