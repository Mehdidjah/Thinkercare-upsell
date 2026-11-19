import {Icon} from '../shared/Icon';
import {Wordmark} from '../shared/Wordmark';
import {type State} from '../shared/types';

export function Topbar({view,setView,titles,signingOut,signOut,baseId,saved,demo,reset}:{state:State;view:string;setView:(view:string)=>void;titles:Record<string,string>;signingOut:boolean;signOut:()=>Promise<void>;baseId:string;saved:boolean;demo:boolean;reset:()=>void}){
 return <header className="shell-topbar">
  <div className="shell-topbar__lead">
   <span className="shell-topbar__brand"><Wordmark size="phone"/></span>
   <nav className="shell-crumbs" aria-label="Fil d’Ariane"><span>ThinkerCare</span><span className="shell-crumbs__sep" aria-hidden="true">/</span><span className="shell-crumbs__current" aria-current="page">{titles[view]||'Mon compte'}</span></nav>
  </div>
  <div className="shell-topbar__actions">
   <button type="button" className="icon-btn shell-topbar__phone" aria-label="Mon compte" onClick={()=>setView('admin')}><Icon name="user"/></button>
   <button type="button" className="icon-btn shell-topbar__phone" aria-label="Se déconnecter" disabled={signingOut} onClick={signOut}><Icon name="logout"/></button>
   <button type="button" className="btn btn--secondary" onClick={()=>{if(baseId&&!saved&&!demo&&!confirm('Abandonner l’appel non enregistré et ouvrir un nouvel appel ?'))return;reset();}}><Icon name="plus"/>Nouvel appel</button>
  </div>
 </header>;
}
