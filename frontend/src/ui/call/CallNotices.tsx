import {money} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {useCall,type CatalogueNotice} from './callModel';

/** The words of a catalogue change reloaded in place (H2): the notice and the message sent with it say the same thing. */
export function catalogueNoticeText(notice:CatalogueNotice,offer:number,fee:number|null):{title:string;detail:string}{
 if(notice.kind==='price')return {title:'Prix mis à jour dans le catalogue.',detail:`Annoncez désormais ${money(offer)}${fee!==null?` plus ${money(fee)} de livraison`:''} à la cliente, puis présentez de nouveau l’offre. Votre saisie est conservée.`};
 const n=notice.names.length;
 return {title:n?`${notice.names.join(', ')} : référence${n>1?'s':''} désactivée${n>1?'s':''} dans le catalogue.`:'Une référence de l’offre a été désactivée dans le catalogue.',
  detail:`Retirez-${n>1?'les':'la'} de la routine, puis présentez de nouveau l’offre. Votre saisie est conservée.`};
}

/** Persistent notices about the call itself, shown at every step until dismissed:
 *  additions removed by a change (with « Annuler », A3/SPEC) and a catalogue change reloaded in place (H2). A new price
 *  does not apply to an offer the customer accepted when the server keeps the presented price: that notice then gives way. */
export function CallNotices(){const {removal,dismissRemoval,catalogueNotice,dismissCatalogueNotice,offer,fee,saved,keepsPresentedPrice,matchingOffer}=useCall();
 const n=removal?.names.length||0;
 const text=catalogueNotice&&!saved&&!(catalogueNotice.kind==='price'&&keepsPresentedPrice&&matchingOffer)?catalogueNoticeText(catalogueNotice,offer,fee):null;
 return <>
  {text&&<div className="notice notice--warning call-notice" id="call-catalogue-notice" role="alert"><Icon name="alert" className="notice__icon"/><div className="notice__text"><p className="notice__title">{text.title}</p><p>{text.detail}</p></div><button type="button" className="icon-btn" aria-label="Fermer ce message" onClick={dismissCatalogueNotice}><Icon name="close"/></button></div>}
  {removal&&n>0&&<div className="notice notice--info call-notice" role="status" key={removal.id}><Icon name="info" className="notice__icon"/><div className="notice__text"><p className="notice__title">{n} produit{n>1?'s':''} retiré{n>1?'s':''} de la routine</p><p>{removal.names.join(', ')} : plus compatible{n>1?'s':''} avec les réponses ou les vérifications actuelles.</p></div>
   {removal.undo&&<button type="button" className="btn btn--secondary btn--sm" onClick={removal.undo}>Annuler</button>}
   <button type="button" className="icon-btn" aria-label="Fermer ce message" onClick={dismissRemoval}><Icon name="close"/></button></div>}
 </>;
}
