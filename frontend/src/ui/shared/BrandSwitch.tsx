import {BRANDS,BRAND_LABELS,brandOf,type Brand} from '@touche/domain';

/** The brands the products come from, in BRANDS order: one with an API that does not list BEL.NCO. */
export const brandsIn=(products:{brand?:string}[]):Brand[]=>BRANDS.filter(b=>products.some(p=>brandOf(p)===b));
/** The products of the brand shown, or all of them while there is only one brand. */
export const ofBrand=<T extends {brand?:string}>(products:T[],brand:Brand):T[]=>brandsIn(products).length<2?products:products.filter(p=>brandOf(p)===brand);

/** « Marque » (Catalogue, Parcours produits, Gestion): Touché or BEL.NCO, only when the products come from both. */
export function BrandSwitch({products,brand,setBrand}:{products:{brand?:string}[];brand:Brand;setBrand:(brand:Brand)=>void}){
 const brands=brandsIn(products);
 if(brands.length<2)return null;
 return <div className="seg" role="group" aria-label="Marque">{brands.map(b=><button type="button" key={b} className="seg__item" aria-pressed={brand===b} onClick={()=>setBrand(b)}>{BRAND_LABELS[b]}</button>)}</div>;
}
