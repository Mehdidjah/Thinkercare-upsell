import {money,type Product} from '@touche/domain';
import {Icon} from './Icon';
import {Photo} from './Photo';
import {ProductFacts} from './ProductFacts';

/** Product sheet opened from the call, the catalogue and the product paths. */
export function ProductModal({detail,setDetail,products}:{detail:Product;setDetail:(product:Product|null)=>void;products:Product[]}){
 return <div className="modal-backdrop" onClick={()=>setDetail(null)}><section className="cat-sheet" role="dialog" aria-modal="true" aria-labelledby="cat-sheet-title" onClick={e=>e.stopPropagation()}>
  <button type="button" className="icon-btn cat-sheet__close" onClick={()=>setDetail(null)} aria-label="Fermer la fiche"><Icon name="close"/></button>
  <div className="cat-sheet__media"><Photo product={detail}/></div>
  <div className="cat-sheet__content"><p className="cat-sheet__meta">{detail.category}, {detail.size}</p><h2 id="cat-sheet-title">{detail.name}</h2><p className="cat-sheet__price num">{money(detail.price)}</p><ProductFacts product={detail} catalogue={products}/></div>
 </section></div>;
}
