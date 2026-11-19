import {quantityOf,lineTotal,isPack,expand,money} from '@touche/domain';
import QuantityControl from '../QuantityControl';
import {Icon} from '../shared/Icon';
import {Photo} from '../shared/Photo';
import {useCall} from './callModel';
import {OfferTotals} from './OfferTotals';

/** The live proposal: basket, quantities, then price options, delivery and summary (OfferTotals). */
export function RoutineRail(){const {step,saved,busy,presenting,products,baseIds,base,initial,blocked,upgradeId,adds,requestedIds,removeComplement,changeQuantity,basket,count}=useCall();
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
   <OfferTotals/>
  </>:<div className="call-rail__empty"><p className="empty__title">Aucun produit pour l’instant</p><p>Sélectionnez tous les produits de la commande initiale.</p></div>}
  <p className="call-rail__foot"><Icon name="shield"/><span>Recommandations d’aide au conseil. Ne remplacent pas un avis médical.</span></p>
 </aside>;
}
