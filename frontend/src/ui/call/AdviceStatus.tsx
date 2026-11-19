import {type ReviewStop} from '@touche/domain';
import {Icon} from '../shared/Icon';

/** Advice after the questions. A targeted stop shows its reason; an urgent one uses the danger tone (MEDSCRIPT). */
export function AdviceStatus({blocked,stop=null,notes}:{blocked:string|null;stop?:ReviewStop|null;notes:string[]}){
 return blocked?<div className={`notice ${stop?.urgent?'notice--danger':'notice--warning'} call-advice`} role={stop?.urgent?'alert':undefined}><Icon name="alert" className="notice__icon"/><div className="notice__text"><p className="notice__title">{stop?.urgent?'Urgence possible : arrêtez la proposition':'Vérification ciblée avant ajout'}</p><p>{blocked}</p></div></div>
  :notes.length?<details className="call-advice call-advice--notes" open><summary>Conseil adapté : précautions, sans renvoi systématique</summary><ul className="call-advice__list" role="list">{notes.map(n=><li key={n}>{n}</li>)}</ul></details>
  :<div className="notice notice--success call-advice"><Icon name="check" className="notice__icon"/><div className="notice__text"><p>Conseil cosmétique courant. Sélection selon le besoin et la routine existante.</p></div></div>;
}
