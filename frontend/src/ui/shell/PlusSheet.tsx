import {useId} from 'react';
import {Icon} from '../shared/Icon';
import {Dialog} from '../shared/Dialog';
import {type State} from '../shared/types';
import {ICONS} from './Sidebar';

/** « Plus » on the phone bar (§6.2): the destinations that do not fit in the bar, Mon compte, the pilot
 *  status and Se déconnecter, in a bottom sheet. */
export function PlusSheet({state,view,more,titles,setView,signingOut,signOut,onClose}:{state:State;view:string;more:string[];titles:Record<string,string>;setView:(view:string)=>void;signingOut:boolean;signOut:()=>Promise<void>;onClose:()=>void}){
 const titleId=useId();
 const go=(v:string)=>{onClose();setView(v);};
 return <Dialog open onClose={onClose} labelledBy={titleId} variant="sheet" dismissOnBackdrop className="shell-plus">
  <div className="dialog__head"><h2 id={titleId} className="dialog__title" data-dialog-title tabIndex={-1}>Plus</h2><button type="button" className="icon-btn dialog__close" aria-label="Fermer" onClick={onClose}><Icon name="close"/></button></div>
  <div className="dialog__body">
   <nav aria-label="Autres destinations"><ul className="shell-plus__list" role="list">
    {[...more,'account'].map(v=><li key={v}><button type="button" className="shell-plus__item" aria-current={view===v?'page':undefined} onClick={()=>go(v)}><Icon name={ICONS[v]}/>{titles[v]}</button></li>)}
   </ul></nav>
   <p className="shell-plus__status">{state.clinical.validated
    ?<span className="tag tag--success"><Icon name="check"/>Protocole validé en interne</span>
    :<span className="tag tag--warning"><Icon name="alert"/>Pilote : validation médicale à finaliser</span>}</p>
   <button type="button" className="btn btn--secondary btn--block" disabled={signingOut} onClick={()=>{onClose();void signOut();}}><Icon name="logout"/>{signingOut?'Déconnexion…':'Se déconnecter'}</button>
  </div>
 </Dialog>;
}
