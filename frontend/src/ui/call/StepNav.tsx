import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

/** The three call steps. */
export function StepNav(){const {step,toStep}=useCall();
 return <div className="steps">{['Commande initiale','Besoin de la cliente','Routine & offre'].map((name,i)=><button key={i} disabled={i>step} onClick={()=>toStep(i)} className={'step '+(step===i?'current':step>i?'done':'')}><span>{step>i?<Icon name="check" size={15}/>:String(i+1).padStart(2,'0')}</span><b>{name}</b></button>)}</div>;
}
