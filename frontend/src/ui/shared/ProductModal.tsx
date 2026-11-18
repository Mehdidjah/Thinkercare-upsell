import {money,type Product} from '@touche/domain';
import {Icon} from './Icon';
import {Photo} from './Photo';
import {ProductFacts} from './ProductFacts';

/** Product sheet opened from the call, the catalogue and the product paths. */
export function ProductModal({detail,setDetail,products}:{detail:Product;setDetail:(product:Product|null)=>void;products:Product[]}){
 return <div className="modal-backdrop" onClick={()=>setDetail(null)}><section className="product-modal enriched-modal" role="dialog" aria-modal="true" aria-label={detail.name} onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setDetail(null)} aria-label="Fermer la fiche"><Icon name="close"/></button><Photo product={detail}/><div><span className="micro">{detail.category} · {detail.size}</span><h2>{detail.name}</h2><h3>{money(detail.price)}</h3><ProductFacts product={detail} catalogue={products}/></div></section></div>;
}
