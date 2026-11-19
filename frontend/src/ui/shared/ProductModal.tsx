import {money,type Product} from '@touche/domain';
import {Icon} from './Icon';
import {Photo} from './Photo';
import {ProductFacts} from './ProductFacts';
import {Dialog} from './Dialog';

/** Product sheet opened from the call, the catalogue and the product paths. A click on the backdrop closes it. */
export function ProductModal({detail,setDetail,products}:{detail:Product;setDetail:(product:Product|null)=>void;products:Product[]}){
 return <Dialog open onClose={()=>setDetail(null)} labelledBy="cat-sheet-title" dismissOnBackdrop className="dialog--wide cat-sheet">
  <button type="button" className="icon-btn cat-sheet__close" onClick={()=>setDetail(null)} aria-label="Fermer la fiche"><Icon name="close"/></button>
  <div className="dialog__body cat-sheet__body">
   <div className="cat-sheet__media"><Photo product={detail} alt={detail.name}/></div>
   <div className="cat-sheet__content"><p className="cat-sheet__meta">{detail.category}, {detail.size}</p><h2 id="cat-sheet-title" data-dialog-title tabIndex={-1}>{detail.name}</h2><p className="cat-sheet__price num">{money(detail.price)}</p><ProductFacts product={detail} catalogue={products}/></div>
  </div>
 </Dialog>;
}
