import {useId} from 'react';
import {quantityOf,lineTotal,unitCount,basketOffer,isPack,expand,summaryText,money,type Tier} from '@touche/domain';
import QuantityControl from '../QuantityControl';
import {Icon} from '../shared/Icon';
import {Photo} from '../shared/Photo';
import {useCall} from './callModel';

/** The live proposal: basket, quantities, price options, delivery and summary. */
export function RoutineRail(){const {step,saved,busy,presenting,products,baseIds,base,initial,baseTotal,blocked,upgradeId,adds,requestedIds,removeComplement,changeQuantity,basket,count,total,altered,tier,chooseTier,offer,delivery,changeDelivery,fee,copy}=useCall();
 const deliveryId=useId();
 return <aside className="call-rail" aria-labelledby="call-rail-title">
  <div className="call-rail__head"><h2 id="call-rail-title">Votre routine</h2><p className="call-rail__meta">{basket.length?`${count} unité${count>1?'s':''}, ${basket.length} référence${basket.length>1?'s':''}`:'En attente de sélection'}</p></div>
  {base?<>
   <ul className="call-basket" role="list">{basket.map(p=>{const extra=baseIds.includes(p.id)?quantityOf(p)-quantityOf(initial.find(x=>x.id===p.id)!):0;return <li className="call-basket__item" key={p.id}>
    <Photo product={p} small/>
    <div className="call-basket__main">
     <p className="call-basket__role">{baseIds.includes(p.id)?'Commande initiale':p.id===upgradeId?'Pack de remplacement':requestedIds.includes(p.id)?'Demandé par la cliente':`Complément ${adds.indexOf(p.id)+1}`}</p>
     <p className="call-basket__name">{p.short}</p>
     {isPack(p)&&<p className="call-basket__note">{expand(p,products).map(x=>x.short).join(' + ')}</p>}
     {quantityOf(p)>1&&<p className="call-basket__note"><span className="num">{quantityOf(p)} × {money(p.price)}</span> par unité</p>}
     {extra>0&&<p className="call-basket__note">Dont {extra} {extra>1?'unités ajoutées':'unité ajoutée'}</p>}
     {step===2&&<QuantityControl label={'Quantité de '+p.name} value={quantityOf(p)} min={p.id===upgradeId?quantityOf(initial[0]):quantityOf(initial.find(x=>x.id===p.id)||{quantity:1})} disabled={saved||busy||presenting||!!blocked} onChange={next=>changeQuantity(p.id,next)}/>}
    </div>
    <div className="call-basket__side"><span className="call-basket__price num">{money(lineTotal(p))}</span>{adds.includes(p.id)&&<button type="button" className="icon-btn" disabled={saved||busy||presenting} aria-label={'Retirer '+p.name+' de la routine'} onClick={()=>removeComplement(p.id)}><Icon name="close"/></button>}</div>
   </li>;})}</ul>
   {count===1&&<p className="call-rail__hint"><Icon name="plus"/>Le bon complément apparaîtra après les questions.</p>}
   <div className="call-rail__totals">
    <p className="call-rail__row"><span>Total catalogue</span><b className="num">{money(total)}</b></p>
    {altered?<>
     <div className="call-price" role="group" aria-label="Prix proposé à la cliente">{([['catalogue','Prix catalogue'],['duo','Première offre'],['final','Offre finale autorisée']] as [Tier,string][]).map(([t,l])=><button key={t} type="button" className="option option--price" data-kind="single" aria-pressed={tier===t} disabled={saved} onClick={()=>chooseTier(t)}><span className="option__indicator" aria-hidden="true"/><span className="option__body"><span className="option__title">{l}</span><span className="option__desc">{t==='catalogue'?'Sans remise':<>Économie <span className="num">{money(total-basketOffer(basket,t))}</span></>}</span></span><span className="option__price num">{money(basketOffer(basket,t))}</span></button>)}</div>
     <p className="call-rail__row"><span>Ajout à la commande initiale</span><b className="num">+ {money(offer-baseTotal)}</b></p>
     <p className="call-rail__note">{tier==='catalogue'?'Prix catalogue sans remise. Les frais de livraison sont ajoutés séparément.':basket.some(isPack)?'Tarif pack conservé. Remise sur les compléments seulement, puis un arrondi final à la centaine supérieure.':'Calcul sur le panier complet. Un seul arrondi à la centaine supérieure. Remises non cumulables.'}</p>
    </>:<p className="call-rail__note">{unitCount(initial)>1?'Total de la commande initiale, sans remise additionnelle.':isPack(basket[0])?'Tarif pack conservé, sans remise supplémentaire.':'Prix du produit seul, sans remise duo.'}</p>}
    <div className="field call-rail__delivery"><label className="field__label" htmlFor={deliveryId}>Frais de livraison <span className="field-optional">hors remise</span></label><span className="field__control-wrap"><input id={deliveryId} inputMode="numeric" type="number" min="0" max="10000" placeholder="À confirmer" value={delivery} disabled={saved} onChange={e=>changeDelivery(e.target.value)}/><span className="field__suffix" aria-hidden="true">DA</span></span></div>
    <div className="call-readout"><p className="call-readout__label">{fee===null?'Total produits':'Total avec livraison'}</p><p className="call-readout__value num">{money(offer+(fee||0))}</p>{fee===null&&<p className="call-readout__meta">Livraison non renseignée, à ajouter au prix annoncé.</p>}</div>
    <button type="button" className="btn btn--secondary btn--block" disabled={!!blocked} onClick={()=>copy(summaryText(base,basket,tier,fee,initial))}><Icon name="copy"/>Copier le récapitulatif</button>
   </div>
  </>:<div className="call-rail__empty"><p className="empty__title">Aucun produit pour l’instant</p><p>Sélectionnez tous les produits de la commande initiale.</p></div>}
  <p className="call-rail__foot"><Icon name="shield"/><span>Recommandations d’aide au conseil. Ne remplacent pas un avis médical.</span></p>
 </aside>;
}
