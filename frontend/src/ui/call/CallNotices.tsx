import {money} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

/** Persistent notices about the call itself, shown at every step until dismissed:
 *  additions removed by a change (with « Annuler », A3/SPEC) and a catalogue change reloaded in place (H2). */
export function CallNotices(){const {removal,dismissRemoval,catalogueNotice,dismissCatalogueNotice,offer,fee,saved}=useCall();
 const n=removal?.names.length||0;
 return <>
  {catalogueNotice&&!saved&&<div className="notice notice--warning call-notice" role="alert"><Icon name="alert" className="notice__icon"/><div className="notice__text">
   {catalogueNotice.kind==='price'
    ?<><p className="notice__title">Prix mis à jour dans le catalogue.</p><p>Annoncez désormais <b className="num">{money(offer)}</b>{fee!==null?<> plus <span className="num">{money(fee)}</span> de livraison</>:''} à la cliente, puis présentez de nouveau l’offre. Votre saisie est conservée.</p></>
    :<><p className="notice__title">{catalogueNotice.names.length?`${catalogueNotice.names.join(', ')} : référence désactivée dans le catalogue.`:'Une référence de l’offre a été désactivée dans le catalogue.'}</p><p>Retirez-la de la routine, puis présentez de nouveau l’offre. Votre saisie est conservée.</p></>}
  </div><button type="button" className="icon-btn" aria-label="Fermer ce message" onClick={dismissCatalogueNotice}><Icon name="close"/></button></div>}
  {removal&&n>0&&<div className="notice notice--info call-notice" role="status" key={removal.id}><Icon name="info" className="notice__icon"/><div className="notice__text"><p className="notice__title">{n} produit{n>1?'s':''} retiré{n>1?'s':''} de la routine</p><p>{removal.names.join(', ')} : plus compatible{n>1?'s':''} avec les réponses ou les vérifications actuelles.</p></div>
   {removal.undo&&<button type="button" className="btn btn--secondary btn--sm" onClick={removal.undo}>Annuler</button>}
   <button type="button" className="icon-btn" aria-label="Fermer ce message" onClick={dismissRemoval}><Icon name="close"/></button></div>}
 </>;
}
