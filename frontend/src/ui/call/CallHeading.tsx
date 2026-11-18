import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

/** Call page heading, worked examples and the example-mode banner. */
export function CallHeading(){const {step,reset,demo,domain}=useCall();
 return <><div className="page-heading"><div><div className="micro">LE CONSEIL, AVANT LA VENTE</div><h1 id="workflow-heading" tabIndex={-1}>{step===0?'Chaque besoin mérite son conseil.':step===1?'Écoutons ce qui compte.':'Une routine qui a du sens.'}</h1><p>{step===0?'Sélectionnez tous les produits déjà commandés, puis construisez une proposition adaptée.':step===1?'Cochez les réponses pendant l’appel. Une priorité, puis un complément utile.':'Ajoutez les compléments utiles, selon les besoins de la cliente.'}</p></div><div className="example-actions"><button className="text-button" onClick={()=>reset(true)}><Icon name="spark" size={17}/>Exemple visage</button><button className="text-button" onClick={()=>reset(true,true)}>Exemple cheveux</button></div></div>{demo&&<div className="demo-banner"><b>Mode exemple</b><span>Parcours fictif {domain==='hair'?'cheveux':'visage'}. Rien ne sera enregistré.</span><button onClick={()=>reset()}>Quitter l’exemple</button></div>}</>;
}
