import {quantityLabel,money} from '@touche/domain';
import {Chip} from '../shared/Chip';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

/** Step 03 · offers actually presented and objections handled. */
export function OfferPresentation(){const {saved,presenting,blocked,altered,offer,presented,matchingOffer,presentOffer,handledObjections,toggleObjection}=useCall();
 return <section className="card call-present" aria-labelledby="call-present-title">
  <div className="section-head"><div><h2 id="call-present-title">Offres effectivement présentées</h2><p>Cliquez après avoir annoncé les produits et le prix. Une suggestion affichée seule ne compte pas.</p></div><span className="counter">{presented.length}</span></div>
  {altered&&<button type="button" className="btn btn--primary btn--lg" disabled={presenting||saved||!!matchingOffer||!!blocked} onClick={()=>void presentOffer()}>{presenting?'Enregistrement…':<>{matchingOffer?<><Icon name="check"/>Cette offre est tracée à </>:'J’ai présenté cette offre à '}<span className="num">{money(offer)}</span></>}</button>}
  {presented.length>0&&<ol className="call-present__list" role="list">{presented.map((p,i)=><li className="call-present__line" key={p.id}><span className="call-present__products">{i+1}. {p.products.map(quantityLabel).join(' + ')}</span><b className="num">{money(p.offerTotal)}</b>{p.id===matchingOffer?.id?<span className="tag tag--accent"><Icon name="check"/>Composition actuelle</span>:<span className="tag tag--neutral">Offre précédente</span>}</li>)}</ol>}
  <details className="call-present__objections"><summary>Objections réellement traitées pendant cet appel</summary><div className="chips">{[['budget','Budget'],['only','Produit seul'],['already','Déjà équipée'],['efficacy','Efficacité'],['reaction','Tolérance'],['later','Plus tard'],['many','Trop de soins'],['discount','Remise supplémentaire']].map(([k,l])=><Chip key={k} selected={handledObjections.includes(k)} disabled={saved} onClick={()=>toggleObjection(k)}>{l}</Chip>)}</div></details>
 </section>;
}
