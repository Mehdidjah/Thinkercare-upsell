import {Icon} from '../shared/Icon';

export function AdviceStatus({blocked,notes}:{blocked:string|null;notes:string[]}){
 return blocked?<div className="notice notice--warning call-advice"><Icon name="alert" className="notice__icon"/><div className="notice__text"><p className="notice__title">Vérification ciblée avant ajout</p><p>{blocked}</p></div></div>
  :notes.length?<details className="call-advice call-advice--notes" open><summary>Conseil adapté : précautions, sans renvoi systématique</summary><ul className="call-advice__list" role="list">{notes.map(n=><li key={n}>{n}</li>)}</ul></details>
  :<div className="notice notice--success call-advice"><Icon name="check" className="notice__icon"/><div className="notice__text"><p>Conseil cosmétique courant. Sélection selon le besoin et la routine existante.</p></div></div>;
}
