import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

const STEPS=['Commande initiale','Besoin de la cliente','Routine & offre'];

/** The three call steps: done steps link back, the current one carries aria-current="step". */
export function StepNav(){const {step,toStep}=useCall();
 return <nav className="call-steps" aria-label="Étapes de l’appel"><ol className="call-steps__list" role="list">{STEPS.map((name,i)=><li key={name} className="call-steps__item" data-state={i<step?'done':i===step?'current':'upcoming'}>
  {i<step
   ?<button type="button" className="call-steps__link" onClick={()=>toStep(i)}><span className="call-steps__marker"><Icon name="check"/></span><span className="call-steps__label">{name}</span><span className="sr-only">, terminée</span></button>
   :<span className="call-steps__static" aria-current={i===step?'step':undefined}><span className="call-steps__marker">{i+1}</span><span className="call-steps__label">{name}</span>{i>step&&<span className="sr-only">, à venir</span>}</span>}
 </li>)}</ol></nav>;
}
