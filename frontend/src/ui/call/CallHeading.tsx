import {BRAND_LABELS} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

const TITLES=['Commande initiale','Besoin de la cliente','Routine & offre'];
const LEADS=['Sélectionnez tous les produits déjà commandés, puis construisez une proposition adaptée.','Cochez les réponses pendant l’appel. Une priorité, puis un complément utile.','Ajoutez un complément utile, choisissez le prix, présentez l’offre, puis clôturez l’appel.'];

/** Call page heading (with the call's brand once two brands have products), worked examples and the example-mode banner.
 *  The Touché examples show on a Touché call only. An example keeps the live call aside; leaving it brings it back (A1).
 *  No example starts while a save or a presentation is on its way: its answer belongs to the call on screen. */
export function CallHeading(){const {step,demo,domain,brand,brands,busy,presenting,startExample,exitExample,hasParkedCall,parkedSaved}=useCall();
 const waiting=busy||presenting;
 return <>
  <div className="page-head call-head">
   <div><div className="call-head__title"><h1 id="workflow-heading" tabIndex={-1}>{TITLES[step]}</h1>{brands.length>1&&<span className="tag tag--neutral">{BRAND_LABELS[brand]}</span>}</div><p>{LEADS[step]}</p></div>
   {brand==='touche'&&<div className="page-head__actions"><button type="button" className="btn btn--ghost btn--sm" disabled={waiting} onClick={()=>startExample('face')}><Icon name="spark"/>Exemple visage</button><button type="button" className="btn btn--ghost btn--sm" disabled={waiting} onClick={()=>startExample('hair')}><Icon name="spark"/>Exemple cheveux</button></div>}
  </div>
  {demo&&<div className="notice notice--info call-demo" role="status"><Icon name="info" className="notice__icon"/><div className="notice__text"><p><b>Mode exemple</b> : parcours fictif {domain==='hair'?'cheveux':'visage'}. Rien ne sera enregistré.{hasParkedCall&&(parkedSaved?' Votre appel enregistré est mis de côté.':' Votre appel en cours est mis de côté.')}</p></div><button type="button" className="btn btn--secondary btn--sm" onClick={exitExample}>{hasParkedCall?'Quitter l’exemple et reprendre l’appel':'Quitter l’exemple'}</button></div>}
 </>;
}
