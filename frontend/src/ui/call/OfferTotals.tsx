import {useId} from 'react';
import {unitCount,basketOffer,hairPackSets,isPack,packPricing,summaryText,money,type Tier} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

const TIERS:[Tier,string][]=[['catalogue','Prix catalogue'],['duo','Première offre'],['final','Offre finale autorisée']];
const signed=(n:number)=>(n<0?'− ':'+ ')+money(Math.abs(n));
/** A pack's price is already a promotion (owner, 2026-11-21): an offer of packs only has one price, and beside other products
 *  the 2nd and 3rd offers discount those products only (packPricing). */
export const PACK_ONLY_NOTE='Prix du pack déjà promotionnel : pas de 2e ni de 3e offre.';
export const PACK_MIXED_NOTE='Le pack garde son prix promotionnel : la remise des 2e et 3e offres ne porte que sur les autres produits.';

/**
 * Price options, delivery, the total to announce and « Copier le récapitulatif ». The rail shows it beside the call; under
 * 1024px the rail drops below the call, so step 3 shows it before the presentation panel and the rail hides its own copy
 * (C1: one set of totals on screen). In the rail the readout and the copy button stay pinned to its bottom (RAIL).
 * A price that does not raise the initial order says why, next to the options (M5). An offer of packs only (a pack upgrade, a
 * pack added, or a set-priced pack's products chosen one by one) is the same amount at every level: it shows that one price,
 * « Prix du pack » (with the saving on the products one by one), and says why there is no 2nd or 3rd offer. Beside other
 * products the three levels stay, with a note that their discount leaves the pack's price alone.
 */
export function OfferTotals(){const {saved,base,initial,baseTotal,blocked,basket,total,altered,tier,chooseTier,offer,offerIssue,delivery,changeDelivery,fee,copy,products}=useCall();
 const deliveryId=useId(),issueId=useId(),noteId=useId();
 if(!base)return null;
 const priceAt=(t:Tier)=>basketOffer(basket,t,products),packRate=hairPackSets(basket,products).sets.length>0,packs=packPricing(basket,products);
 return <>
  <div className="call-totals">
   <p className="call-rail__row"><span>Total catalogue</span><b className="num">{money(total)}</b></p>
   {altered?<>
    <div className="call-price" role="group" aria-label="Prix proposé à la cliente" aria-describedby={[offerIssue&&issueId,packs&&noteId].filter(Boolean).join(' ')||undefined}>{packs==='pack'?<div className="call-price__pack"><span className="option__body"><span className="option__title">Prix du pack</span>{total>offer&&<span className="option__desc">Économie <span className="num">{money(total-offer)}</span></span>}</span><span className="option__price num">{money(offer)}</span></div>:TIERS.map(([t,l])=><button key={t} type="button" className="option option--price" data-kind="single" aria-pressed={tier===t} disabled={saved} onClick={()=>chooseTier(t)}><span className="option__indicator" aria-hidden="true"/><span className="option__body"><span className="option__title">{l}</span><span className="option__desc">{t==='catalogue'&&priceAt(t)>=total?'Sans remise':<>Économie <span className="num">{money(total-priceAt(t))}</span></>}</span></span><span className="option__price num">{money(priceAt(t))}</span></button>)}</div>
    {offerIssue&&<p id={issueId} className="notice notice--warning call-price__issue" role="status"><Icon name="alert" className="notice__icon"/><span className="notice__text">{offerIssue}</span></p>}
    <p className="call-rail__row"><span>Ajout à la commande initiale</span><b className="num">{signed(offer-baseTotal)}</b></p>
    <p id={packs?noteId:undefined} className="call-rail__note">{packs==='pack'?PACK_ONLY_NOTE:packs?PACK_MIXED_NOTE:tier==='catalogue'?'Prix catalogue sans remise. Les frais de livraison sont ajoutés séparément.':'Calcul sur le panier complet. Un seul arrondi à la centaine supérieure. Remises non cumulables.'}</p>
   </>:<p className="call-rail__note">{unitCount(initial)>1?(packRate?'Total de la commande initiale au tarif pack, sans remise additionnelle.':'Total de la commande initiale, sans remise additionnelle.'):isPack(basket[0])?'Tarif pack conservé, sans remise supplémentaire.':'Prix du produit seul, sans remise duo.'}</p>}
   <div className="field call-rail__delivery"><label className="field__label" htmlFor={deliveryId}>Frais de livraison <span className="field-optional">hors remise</span></label><span className="field__control-wrap"><input id={deliveryId} inputMode="numeric" type="number" min="0" max="10000" placeholder="À confirmer" value={delivery} disabled={saved} onChange={e=>changeDelivery(e.target.value)}/><span className="field__suffix" aria-hidden="true">DA</span></span></div>
  </div>
  <div className="call-total-bar">
   <div className="call-readout"><p className="call-readout__label">{fee===null?'Total produits':'Total avec livraison'}</p><p className="call-readout__value num">{money(offer+(fee||0))}</p>{fee===null&&<p className="call-readout__meta">Livraison non renseignée, à ajouter au prix annoncé.</p>}</div>
   <button type="button" className="btn btn--secondary btn--block" disabled={!!blocked} onClick={()=>copy(summaryText(base,basket,tier,fee,products,initial),'Récapitulatif copié.')}><Icon name="copy"/>Copier le récapitulatif</button>
  </div>
 </>;
}
