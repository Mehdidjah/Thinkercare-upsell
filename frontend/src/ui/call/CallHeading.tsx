import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

const TITLES=['Commande initiale','Besoin de la cliente','Routine & offre'];
const LEADS=['Sélectionnez tous les produits déjà commandés, puis construisez une proposition adaptée.','Cochez les réponses pendant l’appel. Une priorité, puis un complément utile.','Ajoutez un complément utile, choisissez le prix, présentez l’offre, puis clôturez l’appel.'];

/** Call page heading, worked examples and the example-mode banner. An example keeps the live call aside; leaving it brings it back (A1). */
export function CallHeading(){const {step,demo,domain,startExample,exitExample,hasParkedCall}=useCall();
 return <>
  <div className="page-head call-head">
   <div><h1 id="workflow-heading" tabIndex={-1}>{TITLES[step]}</h1><p>{LEADS[step]}</p></div>
   <div className="page-head__actions"><button type="button" className="btn btn--ghost btn--sm" onClick={()=>startExample('face')}><Icon name="spark"/>Exemple visage</button><button type="button" className="btn btn--ghost btn--sm" onClick={()=>startExample('hair')}><Icon name="spark"/>Exemple cheveux</button></div>
  </div>
  {demo&&<div className="notice notice--info call-demo" role="status"><Icon name="info" className="notice__icon"/><div className="notice__text"><p><b>Mode exemple</b> : parcours fictif {domain==='hair'?'cheveux':'visage'}. Rien ne sera enregistré.{hasParkedCall&&' Votre appel en cours est mis de côté.'}</p></div><button type="button" className="btn btn--secondary btn--sm" onClick={exitExample}>{hasParkedCall?'Quitter l’exemple et reprendre l’appel':'Quitter l’exemple'}</button></div>}
 </>;
}
