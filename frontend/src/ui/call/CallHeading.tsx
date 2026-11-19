import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

const TITLES=['Commande initiale','Besoin de la cliente','Routine & offre'];
const LEADS=['Sélectionnez tous les produits déjà commandés, puis construisez une proposition adaptée.','Cochez les réponses pendant l’appel. Une priorité, puis un complément utile.','Ajoutez un complément utile, choisissez le prix, présentez l’offre, puis clôturez l’appel.'];

/** Call page heading, worked examples and the example-mode banner. */
export function CallHeading(){const {step,reset,demo,domain}=useCall();
 return <>
  <div className="page-head call-head">
   <div><h1 id="workflow-heading" tabIndex={-1}>{TITLES[step]}</h1><p>{LEADS[step]}</p></div>
   <div className="page-head__actions"><button type="button" className="btn btn--ghost btn--sm" onClick={()=>reset(true)}><Icon name="spark"/>Exemple visage</button><button type="button" className="btn btn--ghost btn--sm" onClick={()=>reset(true,true)}><Icon name="spark"/>Exemple cheveux</button></div>
  </div>
  {demo&&<div className="notice notice--info call-demo" role="status"><Icon name="info" className="notice__icon"/><div className="notice__text"><p><b>Mode exemple</b> : parcours fictif {domain==='hair'?'cheveux':'visage'}. Rien ne sera enregistré.</p></div><button type="button" className="btn btn--secondary btn--sm" onClick={()=>reset()}>Quitter l’exemple</button></div>}
 </>;
}
